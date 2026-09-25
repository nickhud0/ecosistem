import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Check, Moon, ShieldCheck, Sun } from "lucide-react";
import { usePos } from "@/lib/pos-store";
import { Numpad, centsToNumber, popDigit, pushDigit } from "@/components/pos/numpad";
import { brl } from "@/lib/pos-format";

export function LoginScreen() {
  const pos = usePos();
  const navigate = useNavigate({ from: "/" });
  const [pin, setPin] = useState("");
  const [error, setError] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [floatCents, setFloatCents] = useState("");

  useEffect(() => {
    if (pos.ready && pos.user && pos.shiftOpen) navigate({ to: "/salao" });
  }, [pos.ready, pos.user, pos.shiftOpen, navigate]);

  if (!pos.ready) return <div className="min-h-screen bg-background" />;

  const submitPin = async () => {
    if (isSubmitting || pin.length < 4) return;
    setIsSubmitting(true);
    setError(false);
    setErrorMessage("");

    try {
      const ok = await pos.login(pin);
      if (!ok) {
        setError(true);
        setErrorMessage("PIN não encontrado no sistema. Use o PIN 1234 (Operador padrão).");
        setPin("");
      }
    } catch (err) {
      console.error("[LoginScreen Error]:", err);
      setError(true);
      setErrorMessage("Erro ao consultar banco de dados. Tente novamente.");
      setPin("");
    } finally {
      setIsSubmitting(false);
    }
  };

  const openShift = async () => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    try {
      await pos.openShift(centsToNumber(floatCents));
      navigate({ to: "/salao" });
    } catch (err) {
      console.error("[LoginScreen Error]:", err);
      navigate({ to: "/salao" });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className="relative grid min-h-screen place-items-center overflow-hidden bg-background px-6 text-foreground">
      <div className="pointer-events-none absolute -top-52 left-1/4 size-[620px] rounded-full bg-brand/30 blur-[60px] will-change-transform transform-gpu hidden dark:block" />
      <div className="pointer-events-none absolute -right-36 bottom-0 size-[540px] rounded-full bg-cyan/20 blur-[60px] will-change-transform transform-gpu hidden dark:block" />
      <button
        type="button"
        onClick={pos.toggleTheme}
        className="tap absolute top-6 right-6 grid size-12 place-items-center rounded-2xl glass"
        aria-label="Alternar tema"
      >
        {pos.theme === "dark" ? <Sun className="size-5" /> : <Moon className="size-5" />}
      </button>
      <section className="relative w-full max-w-md rounded-3xl glass p-7 shadow-2xl shadow-brand/10">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-4 grid size-14 place-items-center rounded-2xl bg-linear-to-br from-brand to-cyan font-display text-2xl font-bold text-brand-foreground">
            F
          </div>
          <h1 className="text-2xl font-semibold">Fluxo PDV</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {pos.user ? "Abertura de turno" : "Identifique-se para acessar o caixa"}
          </p>
        </div>

        {!pos.user ? (
          <>
            <div className="mb-4 flex h-16 items-center justify-center gap-3 rounded-2xl glass-soft">
              {Array.from({ length: 6 }).map((_, i) => (
                <span
                  key={i}
                  className={`size-3 rounded-full ${i < pin.length ? "bg-cyan" : "bg-muted"}`}
                />
              ))}
            </div>
            {error ? (
              <p className="mb-3 text-center text-xs text-wait font-medium">
                {errorMessage || "PIN inválido. Digite o PIN cadastrado."}
              </p>
            ) : null}
            <Numpad
              size="lg"
              onDigit={(d) => {
                setError(false);
                setErrorMessage("");
                setPin((p) => pushDigit(p, d, 6));
              }}
              onBackspace={() => {
                setError(false);
                setErrorMessage("");
                setPin(popDigit);
              }}
              onClear={() => {
                setError(false);
                setErrorMessage("");
                setPin("");
              }}
            />
            <button
              type="button"
              onClick={submitPin}
              disabled={pin.length < 4 || isSubmitting}
              className="tap mt-3 flex h-16 w-full items-center justify-center gap-2 rounded-2xl bg-linear-to-br from-brand to-cyan font-display font-bold text-brand-foreground shadow-lg shadow-brand/30 disabled:opacity-40"
            >
              <ShieldCheck className="size-5" />
              {isSubmitting ? "Verificando..." : "Entrar no caixa"}
            </button>
            <div className="mt-4 flex flex-col items-center gap-1.5 text-center text-xs text-muted-foreground">
              <p>
                Operador padrão: PIN <strong className="text-foreground">1234</strong>
              </p>
              <button
                type="button"
                onClick={async () => {
                  setPin("1234");
                  setError(false);
                  setErrorMessage("");
                  setIsSubmitting(true);
                  try {
                    await pos.login("1234");
                  } finally {
                    setIsSubmitting(false);
                  }
                }}
                className="tap text-cyan underline hover:text-cyan/80 cursor-pointer text-[11px]"
              >
                Entrar com PIN padrão (1234)
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="mb-4 rounded-2xl glass-soft p-4 text-center">
              <p className="text-xs tracking-wider text-muted-foreground uppercase">
                Fundo de troco
              </p>
              <p className="num mt-1 text-4xl font-bold">{brl(centsToNumber(floatCents))}</p>
            </div>
            <Numpad
              size="lg"
              onDigit={(d) => setFloatCents((c) => pushDigit(c, d))}
              onBackspace={() => setFloatCents(popDigit)}
              onClear={() => setFloatCents("")}
            />
            <button
              type="button"
              onClick={openShift}
              disabled={isSubmitting}
              className="tap mt-3 flex h-16 w-full items-center justify-center gap-2 rounded-2xl bg-linear-to-br from-brand to-cyan font-display font-bold text-brand-foreground shadow-lg shadow-brand/30 disabled:opacity-40"
            >
              <Check className="size-5" />
              {isSubmitting ? "Abrindo turno..." : "Abrir turno"}
            </button>
          </>
        )}
      </section>
    </main>
  );
}
