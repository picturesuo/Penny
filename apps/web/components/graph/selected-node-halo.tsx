type SelectedNodeHaloProps = {
  radius: number;
};

export function SelectedNodeHalo({ radius }: SelectedNodeHaloProps) {
  return (
    <>
      <circle r={radius + 8} fill="rgba(47, 107, 85, 0.08)" stroke="rgba(47, 107, 85, 0.22)" strokeWidth="1.2" />
      <circle r={radius + 3} fill="none" stroke="rgba(23, 32, 27, 0.18)" strokeWidth="1" />
    </>
  );
}
