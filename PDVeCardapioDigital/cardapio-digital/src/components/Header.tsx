export function Header({ title = "Cardápio Digital" }: { title?: string }) {
  return (
    <header className="pt-3.5 pb-2 px-3 text-center border-b border-zinc-900/60 bg-[#0c0d10]">
      <div className="inline-flex items-center justify-center gap-2">
        <span className="text-xl select-none">🍽️</span>
        <h1 className="text-lg sm:text-xl font-black tracking-tight text-white uppercase">
          {title}
        </h1>
      </div>
    </header>
  );
}
