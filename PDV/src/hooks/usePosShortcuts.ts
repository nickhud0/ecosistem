import { useEffect } from "react";

/**
 * Verifica se o elemento ativo em foco é um campo editável (input, textarea, etc.)
 * onde atalhos de caractere simples não devem ser disparados para não interferir na digitação.
 */
export function isEditableElement(target: EventTarget | null): boolean {
  if (!target || !(target instanceof HTMLElement)) return false;
  const tag = target.tagName.toLowerCase();
  return tag === "input" || tag === "textarea" || tag === "select" || target.isContentEditable;
}

export type GlobalShortcutOptions = {
  onOpenHelp?: () => void;
  onNavigateTab?: (routeIndex: number) => void;
  onEscape?: () => void;
};

/**
 * Hook global para atalhos de teclado de alto nível no PDV Desktop (Tauri).
 * - Previne recarregamentos acidentais (F5, Ctrl+R)
 * - Previne impressão padrão do sistema (Ctrl+P)
 * - Mapeia F1 e '?' para o guia de atalhos
 * - Mapeia Alt+1 a Alt+7 para navegação entre telas
 * - Mapeia F11 para tela cheia nativa
 */
export function useGlobalShortcuts({
  onOpenHelp,
  onNavigateTab,
  onEscape,
}: GlobalShortcutOptions) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // 1. Blindagem Desktop: Bloquear recarregamento acidental (F5 / Ctrl+R)
      if (e.key === "F5" || (e.ctrlKey && e.key.toLowerCase() === "r")) {
        e.preventDefault();
        return;
      }

      // 2. Bloquear diálogo de impressão padrão do navegador (Ctrl+P)
      if (e.ctrlKey && e.key.toLowerCase() === "p") {
        e.preventDefault();
        return;
      }

      // 3. F1 ou '?' (quando fora de digitação): Abrir Guia de Atalhos
      if (e.key === "F1" || (e.key === "?" && !isEditableElement(e.target))) {
        e.preventDefault();
        onOpenHelp?.();
        return;
      }

      // 4. F11: Alternar Tela Cheia (Modo Kiosk)
      if (e.key === "F11") {
        e.preventDefault();
        if (!document.fullscreenElement) {
          document.documentElement.requestFullscreen().catch(() => {});
        } else {
          document.exitFullscreen().catch(() => {});
        }
        return;
      }

      // 5. Alt + 1 até Alt + 7: Navegação entre Telas
      if (e.altKey && e.key >= "1" && e.key <= "7") {
        e.preventDefault();
        const tabIndex = parseInt(e.key, 10) - 1;
        onNavigateTab?.(tabIndex);
        return;
      }

      // 6. Escape global
      if (e.key === "Escape") {
        // Se houver um input focado, retira o foco primeiro
        if (isEditableElement(e.target)) {
          (e.target as HTMLElement).blur();
        }
        onEscape?.();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onOpenHelp, onNavigateTab, onEscape]);
}
