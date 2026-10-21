const sections = [
  ["My copy", "my-accessory"],
  ["Product information", "accessory-information"],
  ["Compatibility", "accessory-compatibility"],
  ["Gallery", "accessory-gallery"],
  ["Specifications", "accessory-specifications"],
  ["Video", "accessory-video"],
] as const;
export function AccessorySectionNav() {
  return (
    <nav aria-label="Accessory sections" className="flex flex-wrap gap-2">
      {sections.map(([label, id]) => (
        <a
          key={id}
          href={`#${id}`}
          className="inline-flex min-h-11 items-center rounded-full bg-secondary px-4 text-sm text-secondary-foreground underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          {label}
        </a>
      ))}
    </nav>
  );
}
