type SelectedNodeHaloProps = {
  radius: number;
};

export function SelectedNodeHalo({ radius }: SelectedNodeHaloProps) {
  return (
    <>
      <circle r={radius + 9} fill="rgba(71, 106, 85, 0.055)" stroke="rgba(71, 106, 85, 0.16)" strokeWidth="1.1" />
      <circle r={radius + 3} fill="none" stroke="rgba(23, 32, 27, 0.13)" strokeWidth="0.9" />
    </>
  );
}
