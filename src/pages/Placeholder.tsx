export default function Placeholder({ title, note }: { title: string; note?: string }) {
  return (
    <section>
      <h1 className="pagetitle">{title.toUpperCase()}</h1>
      <p className="muted">{note ?? 'This screen is designed and will be built in a later step.'}</p>
    </section>
  );
}
