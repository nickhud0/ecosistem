import { useEffect } from "react";
import { RouterProvider } from "@tanstack/react-router";
import { getRouter } from "./router";
import { ensureDatabase } from "./database/db";
import { startSyncWorker, stopSyncWorker } from "./services/syncService";

const router = getRouter();

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

export function App() {
  useEffect(() => {
    let cleanupSync: (() => void) | null = null;

    ensureDatabase()
      .then(() => {
        // Inicia o motor de sincronização em segundo plano após inicialização do SQLite
        cleanupSync = startSyncWorker(30_000);
      })
      .catch((err) => {
        console.error("[App]: Erro ao inicializar banco de dados SQLite:", err);
      });

    return () => {
      if (cleanupSync) {
        cleanupSync();
      } else {
        stopSyncWorker();
      }
    };
  }, []);

  return <RouterProvider router={router} />;
}

export default App;
