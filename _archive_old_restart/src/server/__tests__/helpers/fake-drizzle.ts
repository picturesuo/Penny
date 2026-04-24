const TABLE_NAME = Symbol.for("drizzle:Name");
const TABLE_COLUMNS = Symbol.for("drizzle:Columns");

type TableLike = {
  [TABLE_NAME]: string;
  [TABLE_COLUMNS]: Record<string, { name: string }>;
};

type RowRecord = Record<string, unknown>;
type SqlLike = {
  queryChunks: unknown[];
};

export type FakeDbSeed = Partial<Record<string, RowRecord[]>>;

function cloneValue<T>(value: T): T {
  return structuredClone(value);
}

function getTableName(table: TableLike) {
  return table[TABLE_NAME];
}

function getTableColumns(table: TableLike) {
  return table[TABLE_COLUMNS];
}

function resolveColumnKey(table: TableLike, columnName: string) {
  const columns = getTableColumns(table);

  for (const [key, column] of Object.entries(columns)) {
    if (column.name === columnName) {
      return key;
    }
  }

  return columnName.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase());
}

function isSqlLike(value: unknown): value is SqlLike {
  return Boolean(value) && typeof value === "object" && Array.isArray((value as SqlLike).queryChunks);
}

function isColumn(value: unknown): value is { name: string; table: TableLike } {
  return Boolean(value) && typeof value === "object" && "name" in (value as Record<string, unknown>) && "table" in (value as Record<string, unknown>);
}

function isStringChunk(value: unknown, expected?: string) {
  if (!value || typeof value !== "object" || value.constructor?.name !== "StringChunk") {
    return false;
  }

  const rendered = Array.isArray((value as { value?: unknown[] }).value)
    ? ((value as { value: unknown[] }).value[0] ?? "")
    : "";

  return expected == null ? true : rendered === expected;
}

function readOperand(table: TableLike, row: RowRecord, chunk: unknown): unknown {
  if (Array.isArray(chunk)) {
    return chunk.map((entry) => readOperand(table, row, entry));
  }

  if (isColumn(chunk)) {
    return row[resolveColumnKey(chunk.table, chunk.name)];
  }

  if (chunk && typeof chunk === "object" && "value" in (chunk as Record<string, unknown>)) {
    return (chunk as { value: unknown }).value;
  }

  return chunk;
}

function evaluateSql(table: TableLike, row: RowRecord, expression: unknown): boolean {
  if (!expression) {
    return true;
  }

  if (!isSqlLike(expression)) {
    throw new Error("Unsupported where expression.");
  }

  const { queryChunks } = expression;

  if (queryChunks.length === 3 && isStringChunk(queryChunks[0], "(") && isSqlLike(queryChunks[1]) && isStringChunk(queryChunks[2], ")")) {
    return evaluateSql(table, row, queryChunks[1]);
  }

  if (
    queryChunks.length >= 3 &&
    queryChunks.every((chunk, index) => (index % 2 === 0 ? isSqlLike(chunk) : isStringChunk(chunk, " and ")))
  ) {
    return queryChunks.every((chunk, index) => (index % 2 === 0 ? evaluateSql(table, row, chunk) : true));
  }

  if (queryChunks.length === 5 && isColumn(queryChunks[1]) && isStringChunk(queryChunks[2])) {
    const operator = ((queryChunks[2] as { value: string[] }).value[0] ?? "").trim();
    const left = readOperand(table, row, queryChunks[1]);
    const right = readOperand(table, row, queryChunks[3]);

    if (operator === "=") {
      return left === right;
    }

    if (operator === "<>") {
      return left !== right;
    }

    if (operator === "in") {
      return Array.isArray(right) && right.includes(left);
    }
  }

  throw new Error("Unsupported where expression shape.");
}

function compareOrder(table: TableLike, left: RowRecord, right: RowRecord, orderChunk: unknown) {
  if (!isSqlLike(orderChunk)) {
    return 0;
  }

  const column = orderChunk.queryChunks.find(isColumn);

  if (!column) {
    return 0;
  }

  const direction = orderChunk.queryChunks.some((chunk) => isStringChunk(chunk) && String((chunk as { value: string[] }).value[0]).includes("desc"))
    ? "desc"
    : "asc";
  const key = resolveColumnKey(table, column.name);
  const a = left[key];
  const b = right[key];

  if (a === b) {
    return 0;
  }

  if (a == null) {
    return 1;
  }

  if (b == null) {
    return -1;
  }

  const order = a > b ? 1 : -1;
  return direction === "desc" ? -order : order;
}

class FakeSelectBuilder<TTable extends TableLike> implements PromiseLike<RowRecord[]> {
  private sourceTable: TTable | null = null;
  private predicate: unknown = null;
  private orderChunks: unknown[] = [];
  private rowLimit: number | null = null;

  constructor(private readonly db: FakeDrizzleDb) {}

  from(table: TTable) {
    this.sourceTable = table;
    return this;
  }

  where(predicate: unknown) {
    this.predicate = predicate;
    return this;
  }

  orderBy(...chunks: unknown[]) {
    this.orderChunks = chunks;
    return this;
  }

  limit(count: number) {
    this.rowLimit = count;
    return this.execute();
  }

  then<TResult1 = RowRecord[], TResult2 = never>(
    onfulfilled?: ((value: RowRecord[]) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ) {
    return this.execute().then(onfulfilled, onrejected);
  }

  private async execute() {
    if (!this.sourceTable) {
      throw new Error("Select builder missing source table.");
    }

    let rows = this.db.readTable(this.sourceTable);

    if (this.predicate) {
      rows = rows.filter((row) => evaluateSql(this.sourceTable!, row, this.predicate));
    }

    if (this.orderChunks.length) {
      rows = [...rows].sort((left, right) => {
        for (const chunk of this.orderChunks) {
          const result = compareOrder(this.sourceTable!, left, right, chunk);

          if (result !== 0) {
            return result;
          }
        }

        return 0;
      });
    }

    if (this.rowLimit != null) {
      rows = rows.slice(0, this.rowLimit);
    }

    return rows.map((row) => cloneValue(row));
  }
}

class FakeInsertBuilder<TTable extends TableLike> {
  private payload: RowRecord | null = null;

  constructor(
    private readonly db: FakeDrizzleDb,
    private readonly table: TTable,
  ) {}

  values(payload: RowRecord) {
    this.payload = payload;
    return this;
  }

  async returning() {
    if (!this.payload) {
      throw new Error("Insert builder missing values.");
    }

    const inserted = this.db.insertRow(this.table, this.payload);
    return [cloneValue(inserted)];
  }
}

class FakeUpdateBuilder<TTable extends TableLike> implements PromiseLike<void> {
  private updates: RowRecord | null = null;
  private predicate: unknown = null;
  private shouldReturnRows = false;

  constructor(
    private readonly db: FakeDrizzleDb,
    private readonly table: TTable,
  ) {}

  set(updates: RowRecord) {
    this.updates = updates;
    return this;
  }

  where(predicate: unknown) {
    this.predicate = predicate;
    return this;
  }

  returning() {
    this.shouldReturnRows = true;
    return this.execute();
  }

  then<TResult1 = void, TResult2 = never>(
    onfulfilled?: ((value: void) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ) {
    return this.execute().then(onfulfilled, onrejected);
  }

  private async execute() {
    if (!this.updates) {
      throw new Error("Update builder missing values.");
    }

    const updatedRows = this.db.updateRows(this.table, this.predicate, this.updates);
    return this.shouldReturnRows ? updatedRows.map((row) => cloneValue(row)) : undefined;
  }
}

export class FakeDrizzleDb {
  private readonly rowsByTable = new Map<string, RowRecord[]>();
  private readonly idCounters = new Map<string, number>();
  private readonly now: Date;

  constructor(seed: FakeDbSeed = {}, fixedNow: Date = new Date("2026-04-23T16:00:00.000Z")) {
    this.now = fixedNow;

    for (const [tableName, rows] of Object.entries(seed)) {
      this.rowsByTable.set(tableName, cloneValue(rows ?? []));
    }
  }

  readTable(table: TableLike) {
    return [...this.getRowsReference(table)];
  }

  snapshot(table: TableLike) {
    return this.readTable(table).map((row) => cloneValue(row));
  }

  select() {
    return new FakeSelectBuilder(this);
  }

  insert<TTable extends TableLike>(table: TTable) {
    return new FakeInsertBuilder(this, table);
  }

  update<TTable extends TableLike>(table: TTable) {
    return new FakeUpdateBuilder(this, table);
  }

  async transaction<T>(callback: (tx: FakeDrizzleDb) => Promise<T>) {
    return callback(this);
  }

  insertRow(table: TableLike, payload: RowRecord) {
    const tableName = getTableName(table);
    const row = cloneValue(payload);
    const rows = this.getRowsReference(table);

    if (row.id == null) {
      row.id = this.nextId(tableName);
    }

    if ("createdAt" in getTableColumns(table) && row.createdAt == null) {
      row.createdAt = new Date(this.now);
    }

    if ("updatedAt" in getTableColumns(table) && row.updatedAt == null) {
      row.updatedAt = new Date(this.now);
    }

    rows.push(row);
    return row;
  }

  updateRows(table: TableLike, predicate: unknown, updates: RowRecord) {
    const rows = this.getRowsReference(table);
    const touched: RowRecord[] = [];

    for (const row of rows) {
      if (!predicate || evaluateSql(table, row, predicate)) {
        Object.assign(row, cloneValue(updates));

        if ("updatedAt" in getTableColumns(table)) {
          row.updatedAt = new Date(this.now);
        }

        touched.push(row);
      }
    }

    return touched;
  }

  private getRowsReference(table: TableLike) {
    const tableName = getTableName(table);
    const existing = this.rowsByTable.get(tableName);

    if (existing) {
      return existing;
    }

    const created: RowRecord[] = [];
    this.rowsByTable.set(tableName, created);
    return created;
  }

  private nextId(tableName: string) {
    const next = (this.idCounters.get(tableName) ?? 0) + 1;
    this.idCounters.set(tableName, next);
    return `${tableName}-${next}`;
  }
}
