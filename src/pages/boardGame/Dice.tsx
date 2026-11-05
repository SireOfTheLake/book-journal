const PIPS: Record<number, number[]> = { 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] };

export default function Die({ value, rolling }: { value: number; rolling?: boolean }) {
  return (
    <span className={`bg-die${rolling ? ' rolling' : ''}`} role="img" aria-label={`Die showing ${value}`}>
      {Array.from({ length: 9 }, (_, i) => <i key={i} className={PIPS[value]?.includes(i) ? 'on' : ''} />)}
    </span>
  );
}
