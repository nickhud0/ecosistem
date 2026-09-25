import { useEffect, useState } from "react";
import {
  AlertCircle,
  AlertTriangle,
  Bike,
  Check,
  CheckCircle2,
  ChefHat,
  Database,
  Edit2,
  Eye,
  EyeOff,
  Pause,
  Play,
  Plus,
  Printer,
  Receipt,
  RefreshCw,
  ShoppingBag,
  Sliders,
  Sparkles,
  Trash2,
  UtensilsCrossed,
  Volume2,
  Wifi,
  WifiOff,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/pos/app-shell";
import { Button } from "@/components/ui/button";
import { playNewOrderSound, sanitizeIfoodUuid, testIfoodConnection, type IfoodConfig } from "@/lib/ifood-service";
import {
  generateTestTicketEscPos,
  generateCounterTestTicketEscPos,
  isValidIpv4,
  sendEscPosToPrinter,
  testPrinterConnection,
  type KitchenPrinterConfig,
  type CounterPrinterConfig,
} from "@/lib/printer-service";
import {
  getDefaultCustomizationForProduct,
  type PizzaFlavor,
  type Product,
  type ProductAddon,
  type ProductCustomization,
} from "@/lib/pos-types";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useCouriers } from "@/hooks/useCouriers";
import { useProducts } from "@/hooks/useProducts";
import { useTables } from "@/hooks/useTables";
import { brl } from "@/lib/pos-format";
import { usePos } from "@/lib/pos-store";
import { cn } from "@/lib/utils";
import {
  getPendingSyncCount,
  getSyncStatus,
  testSupabaseConnection,
  triggerSync,
} from "@/services/syncService";
import { isSupabaseConfigured } from "@/services/supabaseClient";

export function SettingsPage() {
  const pos = usePos();
  const {
    tables,
    generateTables,
    addTable,
    deleteTable,
    refetch: refetchTables,
    isLoading: tablesLoading,
  } = useTables();
  const {
    couriers,
    addCourier,
    updateCourier,
    toggleActive: toggleCourierActive,
    deleteCourier,
    isLoading: couriersLoading,
  } = useCouriers();
  const {
    products,
    categories,
    categoryEntities,
    addProduct,
    updateProduct,
    deleteProduct,
    addCategory,
    isLoading: productsLoading,
  } = useProducts();

  // Estados dos Modais
  const [generateCount, setGenerateCount] = useState("12");
  const [isNewTableOpen, setIsNewTableOpen] = useState(false);
  const [newTableNumber, setNewTableNumber] = useState("");
  const [newTableSeats, setNewTableSeats] = useState("4");
  const [newTableWaiter, setNewTableWaiter] = useState("Equipe");

  const [isCourierModalOpen, setIsCourierModalOpen] = useState(false);
  const [courierEditingId, setCourierEditingId] = useState<string | null>(null);
  const [courierName, setCourierName] = useState("");
  const [courierPhone, setCourierPhone] = useState("");

  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);
  const [categoryName, setCategoryName] = useState("");

  const [isProductModalOpen, setIsProductModalOpen] = useState(false);
  const [productModalTab, setProductModalTab] = useState<"dados" | "opcoes">("dados");
  const [editingProductId, setEditingProductId] = useState<string | null>(null);
  const [productName, setProductName] = useState("");
  const [productPrice, setProductPrice] = useState("");
  const [productCategory, setProductCategory] = useState("");
  const [productEmoji, setProductEmoji] = useState("🍔");

  // Estados de Personalização & Modificadores
  const [allowCustomization, setAllowCustomization] = useState(true);
  const [exclusions, setExclusions] = useState<string[]>([]);
  const [newExclusionInput, setNewExclusionInput] = useState("");
  const [addons, setAddons] = useState<ProductAddon[]>([]);
  const [newAddonName, setNewAddonName] = useState("");
  const [newAddonPrice, setNewAddonPrice] = useState("");
  const [isPizza, setIsPizza] = useState(false);
  const [pizzaFlavors, setPizzaFlavors] = useState<PizzaFlavor[]>([]);
  const [newFlavorName, setNewFlavorName] = useState("");
  const [newFlavorPrice, setNewFlavorPrice] = useState("");

  const [isResetModalOpen, setIsResetModalOpen] = useState(false);
  const [resetConfirmText, setResetConfirmText] = useState("");
  const [isResetting, setIsResetting] = useState(false);

  // Estados de confirmação de segurança para exclusões
  const [tableToDelete, setTableToDelete] = useState<{ id: string; number: number } | null>(null);
  const [courierToDelete, setCourierToDelete] = useState<{ id: string; name: string } | null>(null);
  const [productToDelete, setProductToDelete] = useState<{ id: string; name: string } | null>(null);

  const [menuSelectedCategory, setMenuSelectedCategory] = useState("Todos");

  // Estados da Impressora de Cozinha
  const [printerEnabled, setPrinterEnabled] = useState(pos.kitchenPrinterConfig?.enabled ?? true);
  const [printerIp, setPrinterIp] = useState(pos.kitchenPrinterConfig?.ip ?? "192.168.1.200");
  const [printerPort, setPrinterPort] = useState(String(pos.kitchenPrinterConfig?.port ?? 9100));
  const [printerPaperWidth, setPrinterPaperWidth] = useState<"80mm" | "58mm">(
    pos.kitchenPrinterConfig?.paperWidth ?? "80mm",
  );
  const [printerAutoPrint, setPrinterAutoPrint] = useState(
    pos.kitchenPrinterConfig?.autoPrintOnKitchenSend ?? true,
  );

  const [isTestingPrinter, setIsTestingPrinter] = useState(false);
  const [isPrintingTestTicket, setIsPrintingTestTicket] = useState(false);
  const [printerTestStatus, setPrinterTestStatus] = useState<"idle" | "success" | "error">("idle");
  const [printerTestMessage, setPrinterTestMessage] = useState<string>("");
  const [printerLatency, setPrinterLatency] = useState<number | null>(null);
  const [isSavingPrinter, setIsSavingPrinter] = useState(false);

  useEffect(() => {
    if (pos.kitchenPrinterConfig) {
      setPrinterEnabled(pos.kitchenPrinterConfig.enabled);
      setPrinterIp(pos.kitchenPrinterConfig.ip);
      setPrinterPort(String(pos.kitchenPrinterConfig.port));
      setPrinterPaperWidth(pos.kitchenPrinterConfig.paperWidth);
      setPrinterAutoPrint(pos.kitchenPrinterConfig.autoPrintOnKitchenSend);
    }
  }, [pos.kitchenPrinterConfig]);

  // Handlers - Impressora
  const handleTestConnection = async () => {
    const ip = printerIp.trim();
    const port = parseInt(printerPort, 10);
    if (!isValidIpv4(ip)) {
      toast.error("Endereço IPv4 inválido.", {
        description: "Por favor, digite um IP válido como 192.168.1.200.",
      });
      setPrinterTestStatus("error");
      setPrinterTestMessage("Endereço IPv4 inválido (ex: 192.168.1.200)");
      return;
    }
    if (isNaN(port) || port <= 0 || port > 65535) {
      toast.error("Porta inválida.", {
        description: "Informe uma porta entre 1 e 65535 (padrão: 9100).",
      });
      setPrinterTestStatus("error");
      setPrinterTestMessage("Porta inválida (deve ser entre 1 e 65535)");
      return;
    }

    setIsTestingPrinter(true);
    setPrinterTestStatus("idle");
    setPrinterTestMessage("");
    setPrinterLatency(null);

    try {
      const res = await testPrinterConnection(ip, port);
      if (res.success) {
        setPrinterTestStatus("success");
        setPrinterTestMessage(res.message);
        setPrinterLatency(res.latency_ms ?? null);
        toast.success("Impressora conectada com sucesso!", {
          description:
            res.latency_ms !== undefined ? `Tempo de resposta: ${res.latency_ms} ms` : res.message,
        });
      } else {
        setPrinterTestStatus("error");
        setPrinterTestMessage(res.message);
        toast.error("Falha ao comunicar com a impressora", {
          description: res.message,
        });
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setPrinterTestStatus("error");
      setPrinterTestMessage(msg);
      toast.error("Erro ao testar conexão", { description: msg });
    } finally {
      setIsTestingPrinter(false);
    }
  };

  const handlePrintTestTicket = async () => {
    const ip = printerIp.trim();
    const port = parseInt(printerPort, 10);

    if (!isValidIpv4(ip)) {
      toast.error("Endereço IPv4 inválido para teste de impressão.", {
        description: "Informe um IP válido como 192.168.1.200.",
      });
      return;
    }

    if (isNaN(port) || port <= 0 || port > 65535) {
      toast.error("Porta inválida para teste.", {
        description: "Informe uma porta entre 1 e 65535 (padrão: 9100).",
      });
      return;
    }

    setIsPrintingTestTicket(true);
    try {
      const testConfig: KitchenPrinterConfig = {
        enabled: printerEnabled,
        ip,
        port,
        paperWidth: printerPaperWidth,
        autoPrintOnKitchenSend: printerAutoPrint,
      };
      const escposBytes = generateTestTicketEscPos(testConfig);
      const res = await sendEscPosToPrinter(ip, port, escposBytes);
      if (res.success) {
        toast.success("Cupom de teste impresso com sucesso!", {
          description: `Disparado para ${ip}:${port}`,
        });
      } else {
        toast.error("Não foi possível imprimir o cupom de teste.", {
          description: res.message,
        });
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error("Erro ao disparar impressão de teste", { description: msg });
    } finally {
      setIsPrintingTestTicket(false);
    }
  };

  const handleSavePrinterConfig = async () => {
    const ip = printerIp.trim();
    const port = parseInt(printerPort, 10);

    if (printerEnabled && !isValidIpv4(ip)) {
      toast.error("Endereço IPv4 inválido.", {
        description: "Por favor informe um IP válido para ativar a impressora (ex: 192.168.1.200).",
      });
      return;
    }

    if (isNaN(port) || port <= 0 || port > 65535) {
      toast.error("Porta inválida.", {
        description: "Informe uma porta entre 1 e 65535 (padrão: 9100).",
      });
      return;
    }

    setIsSavingPrinter(true);
    try {
      const newConfig: KitchenPrinterConfig = {
        enabled: printerEnabled,
        ip,
        port,
        paperWidth: printerPaperWidth,
        autoPrintOnKitchenSend: printerAutoPrint,
      };
      await pos.updateKitchenPrinterConfig(newConfig);
      toast.success("Configurações da impressora salvas com sucesso!");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error("Erro ao salvar configurações", { description: msg });
    } finally {
      setIsSavingPrinter(false);
    }
  };

  // Estados da Impressora de Balcão / Caixa / Pré-Conta
  const [counterPrinterEnabled, setCounterPrinterEnabled] = useState(
    pos.counterPrinterConfig?.enabled ?? true,
  );
  const [counterPrinterUseKitchen, setCounterPrinterUseKitchen] = useState(
    pos.counterPrinterConfig?.useKitchenPrinter ?? false,
  );
  const [counterPrinterIp, setCounterPrinterIp] = useState(
    pos.counterPrinterConfig?.ip ?? "192.168.1.201",
  );
  const [counterPrinterPort, setCounterPrinterPort] = useState(
    String(pos.counterPrinterConfig?.port ?? 9100),
  );
  const [counterPrinterPaperWidth, setCounterPrinterPaperWidth] = useState<"80mm" | "58mm">(
    pos.counterPrinterConfig?.paperWidth ?? "80mm",
  );
  const [counterIncludeServiceFee, setCounterIncludeServiceFee] = useState(
    pos.counterPrinterConfig?.includeServiceFee ?? true,
  );
  const [counterServiceFeePercent, setCounterServiceFeePercent] = useState(
    String(pos.counterPrinterConfig?.serviceFeePercent ?? 10),
  );

  const [isTestingCounterPrinter, setIsTestingCounterPrinter] = useState(false);
  const [isPrintingCounterTestTicket, setIsPrintingCounterTestTicket] = useState(false);
  const [counterPrinterTestStatus, setCounterPrinterTestStatus] = useState<
    "idle" | "success" | "error"
  >("idle");
  const [counterPrinterTestMessage, setCounterPrinterTestMessage] = useState<string>("");
  const [counterPrinterLatency, setCounterPrinterLatency] = useState<number | null>(null);
  const [isSavingCounterPrinter, setIsSavingCounterPrinter] = useState(false);

  useEffect(() => {
    if (pos.counterPrinterConfig) {
      setCounterPrinterEnabled(pos.counterPrinterConfig.enabled);
      setCounterPrinterUseKitchen(pos.counterPrinterConfig.useKitchenPrinter);
      setCounterPrinterIp(pos.counterPrinterConfig.ip);
      setCounterPrinterPort(String(pos.counterPrinterConfig.port));
      setCounterPrinterPaperWidth(pos.counterPrinterConfig.paperWidth);
      setCounterIncludeServiceFee(pos.counterPrinterConfig.includeServiceFee);
      setCounterServiceFeePercent(String(pos.counterPrinterConfig.serviceFeePercent));
    }
  }, [pos.counterPrinterConfig]);

  const handleTestCounterConnection = async () => {
    const ip = (counterPrinterUseKitchen ? printerIp : counterPrinterIp).trim();
    const port = parseInt(counterPrinterUseKitchen ? printerPort : counterPrinterPort, 10);

    if (!isValidIpv4(ip)) {
      toast.error("Endereço IPv4 inválido.", {
        description: "Por favor, digite um IP válido como 192.168.1.201.",
      });
      setCounterPrinterTestStatus("error");
      setCounterPrinterTestMessage("Endereço IPv4 inválido (ex: 192.168.1.201)");
      return;
    }
    if (isNaN(port) || port <= 0 || port > 65535) {
      toast.error("Porta inválida.", {
        description: "Informe uma porta entre 1 e 65535 (padrão: 9100).",
      });
      setCounterPrinterTestStatus("error");
      setCounterPrinterTestMessage("Porta inválida (deve ser entre 1 e 65535)");
      return;
    }

    setIsTestingCounterPrinter(true);
    setCounterPrinterTestStatus("idle");
    setCounterPrinterTestMessage("");
    setCounterPrinterLatency(null);

    try {
      const res = await testPrinterConnection(ip, port);
      if (res.success) {
        setCounterPrinterTestStatus("success");
        setCounterPrinterTestMessage(res.message);
        setCounterPrinterLatency(res.latency_ms ?? null);
        toast.success("Impressora do balcão conectada com sucesso!", {
          description:
            res.latency_ms !== undefined ? `Tempo de resposta: ${res.latency_ms} ms` : res.message,
        });
      } else {
        setCounterPrinterTestStatus("error");
        setCounterPrinterTestMessage(res.message);
        toast.error("Falha ao comunicar com a impressora do balcão", {
          description: res.message,
        });
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setCounterPrinterTestStatus("error");
      setCounterPrinterTestMessage(msg);
      toast.error("Erro ao testar conexão do balcão", { description: msg });
    } finally {
      setIsTestingCounterPrinter(false);
    }
  };

  const handlePrintCounterTestTicket = async () => {
    const ip = (counterPrinterUseKitchen ? printerIp : counterPrinterIp).trim();
    const port = parseInt(counterPrinterUseKitchen ? printerPort : counterPrinterPort, 10);

    if (!isValidIpv4(ip)) {
      toast.error("Endereço IPv4 inválido para teste de impressão.", {
        description: "Informe um IP válido como 192.168.1.201.",
      });
      return;
    }

    if (isNaN(port) || port <= 0 || port > 65535) {
      toast.error("Porta inválida para teste.", {
        description: "Informe uma porta entre 1 e 65535 (padrão: 9100).",
      });
      return;
    }

    setIsPrintingCounterTestTicket(true);
    try {
      const testConfig: CounterPrinterConfig = {
        enabled: counterPrinterEnabled,
        useKitchenPrinter: counterPrinterUseKitchen,
        ip,
        port,
        paperWidth: counterPrinterPaperWidth,
        includeServiceFee: counterIncludeServiceFee,
        serviceFeePercent: parseInt(counterServiceFeePercent, 10) || 10,
      };
      const escposBytes = generateCounterTestTicketEscPos(testConfig, pos.kitchenPrinterConfig);
      const res = await sendEscPosToPrinter(ip, port, escposBytes);
      if (res.success) {
        toast.success("Cupom de teste do balcão impresso com sucesso!", {
          description: `Disparado para ${ip}:${port}`,
        });
      } else {
        toast.error("Não foi possível imprimir o cupom de teste.", {
          description: res.message,
        });
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error("Erro ao disparar impressão de teste do balcão", { description: msg });
    } finally {
      setIsPrintingCounterTestTicket(false);
    }
  };

  const handleSaveCounterPrinterConfig = async () => {
    const ip = counterPrinterIp.trim();
    const port = parseInt(counterPrinterPort, 10);
    const fee = parseInt(counterServiceFeePercent, 10);

    if (counterPrinterEnabled && !counterPrinterUseKitchen && !isValidIpv4(ip)) {
      toast.error("Endereço IPv4 inválido para o balcão.", {
        description:
          "Por favor informe um IP válido (ex: 192.168.1.201) ou ative a opção de usar a mesma da cozinha.",
      });
      return;
    }

    if (!counterPrinterUseKitchen && (isNaN(port) || port <= 0 || port > 65535)) {
      toast.error("Porta inválida para o balcão.", {
        description: "Informe uma porta entre 1 e 65535 (padrão: 9100).",
      });
      return;
    }

    setIsSavingCounterPrinter(true);
    try {
      const newConfig: CounterPrinterConfig = {
        enabled: counterPrinterEnabled,
        useKitchenPrinter: counterPrinterUseKitchen,
        ip: counterPrinterUseKitchen ? printerIp : ip,
        port: counterPrinterUseKitchen ? parseInt(printerPort, 10) || 9100 : port,
        paperWidth: counterPrinterPaperWidth,
        includeServiceFee: counterIncludeServiceFee,
        serviceFeePercent: isNaN(fee) || fee < 0 ? 10 : fee,
      };
      await pos.updateCounterPrinterConfig(newConfig);
      toast.success("Configurações da impressora de balcão salvas com sucesso!");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error("Erro ao salvar configurações do balcão", { description: msg });
    } finally {
      setIsSavingCounterPrinter(false);
    }
  };

  // Estados de Configuração do iFood
  const [ifoodEnabled, setIfoodEnabled] = useState(pos.ifoodConfig?.enabled ?? true);
  const [ifoodMerchantId, setIfoodMerchantId] = useState(pos.ifoodConfig?.merchantId ?? "");
  const [ifoodClientId, setIfoodClientId] = useState(pos.ifoodConfig?.clientId ?? "");
  const [ifoodClientSecret, setIfoodClientSecret] = useState(pos.ifoodConfig?.clientSecret ?? "");
  const [ifoodAutoAccept, setIfoodAutoAccept] = useState(pos.ifoodConfig?.autoAccept ?? false);
  const [ifoodAutoPrint, setIfoodAutoPrint] = useState(pos.ifoodConfig?.autoPrintKitchen ?? true);
  const [ifoodSoundAlert, setIfoodSoundAlert] = useState(pos.ifoodConfig?.soundAlert ?? true);
  const [ifoodPrepTime, setIfoodPrepTime] = useState(pos.ifoodConfig?.defaultPrepTimeMinutes ?? 30);
  const [showIfoodSecret, setShowIfoodSecret] = useState(false);
  const [isTestingIfood, setIsTestingIfood] = useState(false);
  const [isSimulatingIfood, setIsSimulatingIfood] = useState(false);
  const [isSavingIfood, setIsSavingIfood] = useState(false);
  const [ifoodTestResult, setIfoodTestResult] = useState<{
    status: "idle" | "success" | "error";
    message: string;
  }>({ status: "idle", message: "" });

  useEffect(() => {
    if (pos.ifoodConfig) {
      setIfoodEnabled(pos.ifoodConfig.enabled);
      setIfoodMerchantId(pos.ifoodConfig.merchantId);
      setIfoodClientId(pos.ifoodConfig.clientId);
      setIfoodClientSecret(pos.ifoodConfig.clientSecret);
      setIfoodAutoAccept(pos.ifoodConfig.autoAccept);
      setIfoodAutoPrint(pos.ifoodConfig.autoPrintKitchen);
      setIfoodSoundAlert(pos.ifoodConfig.soundAlert);
      setIfoodPrepTime(pos.ifoodConfig.defaultPrepTimeMinutes);
    }
  }, [pos.ifoodConfig]);

  const handleTestIfood = async () => {
    setIsTestingIfood(true);
    setIfoodTestResult({ status: "idle", message: "" });
    try {
      const res = await testIfoodConnection({
        enabled: ifoodEnabled,
        merchantId: ifoodMerchantId,
        clientId: ifoodClientId,
        clientSecret: ifoodClientSecret,
        autoAccept: ifoodAutoAccept,
        autoPrintKitchen: ifoodAutoPrint,
        soundAlert: ifoodSoundAlert,
        defaultPrepTimeMinutes: ifoodPrepTime,
        storeStatus: pos.ifoodPaused ? "closed" : "open",
      });
      if (res.success) {
        setIfoodTestResult({ status: "success", message: res.message });
        toast.success("Autenticação com iFood validada com sucesso!", {
          description: res.message,
        });
      } else {
        setIfoodTestResult({ status: "error", message: res.message });
        toast.error("Falha ao autenticar com o iFood", {
          description: res.message,
        });
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setIfoodTestResult({ status: "error", message: msg });
      toast.error("Erro no teste da API iFood", { description: msg });
    } finally {
      setIsTestingIfood(false);
    }
  };

  const handleSimulateIfoodOrder = async () => {
    setIsSimulatingIfood(true);
    try {
      const order = await pos.simulateIfoodIncomingOrder();
      toast.success(`Pedido simulado gerado com sucesso! Código: ${order.code}`, {
        description: `Cliente: ${order.customer} · Valor: ${brl(order.total)}`,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error("Erro ao simular pedido iFood", { description: msg });
    } finally {
      setIsSimulatingIfood(false);
    }
  };

  const [isPollingIfoodNow, setIsPollingIfoodNow] = useState(false);
  const handlePollIfoodNow = async () => {
    setIsPollingIfoodNow(true);
    try {
      const res = await pos.pollIfoodNow();
      if (res.success) {
        toast.success(res.message);
      } else {
        toast.error("Consulta de eventos iFood", { description: res.message });
      }
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setIsPollingIfoodNow(false);
    }
  };

  const handleSaveIfoodConfig = async () => {
    setIsSavingIfood(true);
    try {
      const cleanMerchantId = sanitizeIfoodUuid(ifoodMerchantId);
      const cleanClientId = sanitizeIfoodUuid(ifoodClientId);
      const cleanClientSecret = ifoodClientSecret.replace(/^["']|["']$/g, "").trim();

      const newConfig: IfoodConfig = {
        enabled: ifoodEnabled,
        merchantId: cleanMerchantId,
        clientId: cleanClientId,
        clientSecret: cleanClientSecret,
        autoAccept: ifoodAutoAccept,
        autoPrintKitchen: ifoodAutoPrint,
        soundAlert: ifoodSoundAlert,
        defaultPrepTimeMinutes: ifoodPrepTime,
        storeStatus: pos.ifoodPaused ? "closed" : "open",
      };
      await pos.updateIfoodConfig(newConfig);
      toast.success("Configurações do iFood salvas com sucesso!");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error("Erro ao salvar configurações do iFood", { description: msg });
    } finally {
      setIsSavingIfood(false);
    }
  };

  // Handlers - Mesas
  const handleGenerateTables = async () => {
    const count = parseInt(generateCount, 10);
    if (isNaN(count) || count <= 0) {
      toast.error("Informe um número válido de mesas.");
      return;
    }
    try {
      await generateTables(count);
      await pos.reloadAll();
      await refetchTables();
      toast.success(`Mesas geradas com sucesso (até ${count} mesas).`);
    } catch (err: unknown) {
      console.error("[handleGenerateTables Error]:", err);
      toast.error(err instanceof Error ? err.message : "Erro ao gerar mesas.");
    }
  };

  const handleAddTable = async () => {
    const num = parseInt(newTableNumber, 10);
    if (isNaN(num) || num <= 0) {
      toast.error("Informe um número de mesa válido e positivo.");
      return;
    }
    const seats = parseInt(newTableSeats, 10) || 4;
    try {
      await addTable(num, seats, newTableWaiter);
      await pos.reloadAll();
      await refetchTables();
      setIsNewTableOpen(false);
      setNewTableNumber("");
      toast.success(`Mesa ${num} criada com sucesso.`);
    } catch (err: unknown) {
      console.error("[handleAddTable Error]:", err);
      toast.error(err instanceof Error ? err.message : `Erro ao cadastrar mesa ${num}.`);
    }
  };

  const handleDeleteTableClick = (t: { id: string; number: number }) => {
    const liveTable = pos.tables.find((pt) => pt.id === t.id);
    const isOccupied =
      liveTable &&
      (liveTable.status !== "livre" || (liveTable.items && liveTable.items.length > 0));
    if (isOccupied) {
      toast.error(`A Mesa ${t.number} está aberta com itens e não pode ser excluída.`, {
        description: "Encerre ou cancele o atendimento antes de remover a mesa do salão.",
      });
      return;
    }
    setTableToDelete(t);
  };

  const confirmDeleteTable = async () => {
    if (!tableToDelete) return;
    try {
      const liveTable = pos.tables.find((pt) => pt.id === tableToDelete.id);
      if (
        liveTable &&
        (liveTable.status !== "livre" || (liveTable.items && liveTable.items.length > 0))
      ) {
        toast.error(
          `A Mesa ${tableToDelete.number} está em uso no momento e não pode ser excluída.`,
        );
        setTableToDelete(null);
        return;
      }
      await deleteTable(tableToDelete.id);
      await pos.reloadAll();
      await refetchTables();
      toast.success(`Mesa ${tableToDelete.number} removida com sucesso.`);
    } catch (err: unknown) {
      console.error("[confirmDeleteTable Error]:", err);
      toast.error(
        err instanceof Error ? err.message : `Erro ao excluir mesa ${tableToDelete.number}.`,
      );
    } finally {
      setTableToDelete(null);
    }
  };

  const handleDeleteCourierClick = (c: { id: string; name: string }) => {
    const hasActiveDelivery = pos.delivery.some(
      (d) => d.courier === c.name && d.stage !== "entrega",
    );
    if (hasActiveDelivery) {
      toast.error(`O motoboy ${c.name} possui entregas em andamento e não pode ser removido.`, {
        description: "Aguarde a conclusão das entregas antes de excluí-lo.",
      });
      return;
    }
    setCourierToDelete(c);
  };

  const confirmDeleteCourier = async () => {
    if (!courierToDelete) return;
    await deleteCourier(courierToDelete.id);
    await pos.reloadAll();
    toast.success(`Entregador ${courierToDelete.name} removido com sucesso.`);
    setCourierToDelete(null);
  };

  const handleDeleteProductClick = (p: { id: string; name: string }) => {
    const inOpenTable = pos.tables.some((t) => t.items.some((i) => i.name === p.name));
    if (inOpenTable) {
      toast.warning(`Atenção: O produto "${p.name}" está lançado em comandas abertas no salão.`);
    }
    setProductToDelete(p);
  };

  const confirmDeleteProduct = async () => {
    if (!productToDelete) return;
    await deleteProduct(productToDelete.id);
    await pos.reloadAll();
    toast.success(`Produto "${productToDelete.name}" removido do cardápio.`);
    setProductToDelete(null);
  };

  // Handlers - Motoboys
  const handleSaveCourier = async () => {
    if (!courierName.trim()) {
      toast.error("O nome do motoboy é obrigatório.");
      return;
    }
    if (courierEditingId) {
      await updateCourier(courierEditingId, courierName, courierPhone);
      toast.success("Motoboy atualizado.");
    } else {
      await addCourier(courierName, courierPhone);
      toast.success("Motoboy cadastrado com sucesso.");
    }
    await pos.reloadAll();
    setIsCourierModalOpen(false);
    setCourierEditingId(null);
    setCourierName("");
    setCourierPhone("");
  };

  const openEditCourier = (c: { id: string; name: string; phone: string }) => {
    setCourierEditingId(c.id);
    setCourierName(c.name);
    setCourierPhone(c.phone);
    setIsCourierModalOpen(true);
  };

  // Handlers - Cardápio
  const handleAddCategory = async () => {
    if (!categoryName.trim()) {
      toast.error("Nome da categoria é obrigatório.");
      return;
    }
    await addCategory(categoryName);
    await pos.reloadAll();
    setIsCategoryModalOpen(false);
    setCategoryName("");
    toast.success("Categoria adicionada.");
  };

  const loadCategorySuggestions = (catName?: string) => {
    const targetCat = catName || productCategory;
    const suggested = getDefaultCustomizationForProduct(productName, targetCat);
    setAllowCustomization(suggested.allowCustomization);
    setExclusions([...suggested.exclusions]);
    setAddons(suggested.addons.map((a) => ({ ...a })));
    setIsPizza(Boolean(suggested.isPizza));
    setPizzaFlavors(suggested.pizzaFlavors ? suggested.pizzaFlavors.map((f) => ({ ...f })) : []);
    toast.info(`Sugestões carregadas para a categoria "${targetCat}".`);
  };

  const openNewProduct = () => {
    setEditingProductId(null);
    setProductName("");
    setProductPrice("");
    const initialCategory = categories[1] || "Lanches";
    setProductCategory(initialCategory);
    setProductEmoji("🍔");
    const suggested = getDefaultCustomizationForProduct("", initialCategory);
    setAllowCustomization(suggested.allowCustomization);
    setExclusions([...suggested.exclusions]);
    setAddons(suggested.addons.map((a) => ({ ...a })));
    setIsPizza(Boolean(suggested.isPizza));
    setPizzaFlavors(suggested.pizzaFlavors ? suggested.pizzaFlavors.map((f) => ({ ...f })) : []);
    setNewExclusionInput("");
    setNewAddonName("");
    setNewAddonPrice("");
    setNewFlavorName("");
    setNewFlavorPrice("");
    setProductModalTab("dados");
    setIsProductModalOpen(true);
  };

  const openEditProduct = (p: Product) => {
    setEditingProductId(p.id);
    setProductName(p.name);
    setProductPrice(String(p.price));
    setProductCategory(p.category);
    setProductEmoji(p.emoji);
    const custom = p.customization ?? getDefaultCustomizationForProduct(p.name, p.category);
    setAllowCustomization(custom.allowCustomization);
    setExclusions([...custom.exclusions]);
    setAddons(custom.addons.map((a) => ({ ...a })));
    setIsPizza(Boolean(custom.isPizza));
    setPizzaFlavors(custom.pizzaFlavors ? custom.pizzaFlavors.map((f) => ({ ...f })) : []);
    setNewExclusionInput("");
    setNewAddonName("");
    setNewAddonPrice("");
    setNewFlavorName("");
    setNewFlavorPrice("");
    setProductModalTab("dados");
    setIsProductModalOpen(true);
  };

  const handleSaveProduct = async () => {
    const priceNum = parseFloat(productPrice.replace(",", "."));
    if (!productName.trim() || isNaN(priceNum) || priceNum < 0) {
      toast.error("Preencha nome e preço válido.");
      return;
    }
    const cat = productCategory || categories[1] || "Geral";

    const customConfig: ProductCustomization = {
      allowCustomization,
      exclusions,
      addons,
      isPizza,
      pizzaFlavors: isPizza ? pizzaFlavors : undefined,
    };

    if (editingProductId) {
      await updateProduct(editingProductId, {
        name: productName,
        price: priceNum,
        categoryName: cat,
        emoji: productEmoji,
        customization: customConfig,
      });
      toast.success("Produto e opcionais atualizados.");
    } else {
      await addProduct({
        name: productName,
        price: priceNum,
        categoryName: cat,
        emoji: productEmoji,
        customization: customConfig,
      });
      toast.success("Produto criado com sucesso.");
    }
    await pos.reloadAll();
    setIsProductModalOpen(false);
    setEditingProductId(null);
    setProductName("");
    setProductPrice("");
  };

  // Handlers - Reset de Fábrica
  const handleFactoryReset = async () => {
    if (resetConfirmText.trim().toUpperCase() !== "RESET") {
      toast.error("Digite 'RESET' para confirmar a limpeza.");
      return;
    }
    setIsResetting(true);
    try {
      await pos.factoryReset();
      await refetchTables();
      setIsResetModalOpen(false);
      setResetConfirmText("");
      toast.success("Banco de dados SQLite zerado com sucesso!");
    } catch (err) {
      console.error(err);
      toast.error("Falha ao zerar banco de dados.");
    } finally {
      setIsResetting(false);
    }
  };

  const syncStatus = getSyncStatus();
  const [pendingSyncCount, setPendingSyncCount] = useState<number>(0);
  const [isManualSyncing, setIsManualSyncing] = useState<boolean>(false);
  const [isTestingSupabase, setIsTestingSupabase] = useState<boolean>(false);

  const refreshPendingSync = async () => {
    try {
      const count = await getPendingSyncCount();
      setPendingSyncCount(count);
    } catch (err) {
      console.error("Erro ao obter contagem de pendências:", err);
    }
  };

  useEffect(() => {
    refreshPendingSync();
    const interval = setInterval(refreshPendingSync, 10_000);
    return () => clearInterval(interval);
  }, []);

  const handleManualSync = async () => {
    setIsManualSyncing(true);
    try {
      const result = await triggerSync();
      const remaining = await getPendingSyncCount();
      setPendingSyncCount(remaining);

      if (result.error) {
        toast.error(`Aviso de sincronização: ${result.error}`);
      } else if (result.pushed > 0 || result.pulled > 0) {
        toast.success(
          `Sincronização concluída: ${result.pushed} enviado(s), ${result.pulled} recebido(s).`,
        );
      } else if (remaining > 0) {
        toast.warning(
          `${remaining} registro(s) pendente(s) aguardando processamento da sincronização.`,
        );
      } else {
        toast.info("Tudo em dia! Nenhum dado pendente de sincronização.");
      }
    } catch (err) {
      toast.error(`Erro ao sincronizar: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setIsManualSyncing(false);
    }
  };

  const handleTestSupabase = async () => {
    setIsTestingSupabase(true);
    try {
      const res = await testSupabaseConnection();
      if (res.success) {
        toast.success(res.message);
      } else {
        toast.error(res.message);
      }
    } catch (err) {
      toast.error(`Falha no teste: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setIsTestingSupabase(false);
    }
  };

  const filteredProducts =
    menuSelectedCategory === "Todos"
      ? products
      : products.filter((p) => p.category === menuSelectedCategory);

  return (
    <AppShell title="Configurações" subtitle="Gestão de cadastros e retaguarda">
      <div className="h-full flex flex-col min-h-0 rounded-3xl glass p-6">
        <Tabs defaultValue="mesas" className="flex flex-col flex-1 min-h-0">
          <TabsList className="mb-6 h-auto sm:h-12 w-full max-w-3xl grid grid-cols-3 sm:grid-cols-6 bg-secondary/80 rounded-2xl p-1 gap-1">
            <TabsTrigger value="mesas" className="rounded-xl text-xs font-semibold">
              Mesas
            </TabsTrigger>
            <TabsTrigger value="motoboys" className="rounded-xl text-xs font-semibold">
              Motoboys
            </TabsTrigger>
            <TabsTrigger value="cardapio" className="rounded-xl text-xs font-semibold">
              Cardápio
            </TabsTrigger>
            <TabsTrigger value="impressora" className="rounded-xl text-xs font-semibold">
              Impressora
            </TabsTrigger>
            <TabsTrigger value="ifood" className="rounded-xl text-xs font-semibold">
              iFood
            </TabsTrigger>
            <TabsTrigger value="sistema" className="rounded-xl text-xs font-semibold">
              Sistema
            </TabsTrigger>
          </TabsList>

          {/* =========================================================
              ABA 1: MESAS
             ========================================================= */}
          <TabsContent value="mesas" className="flex-1 min-h-0 overflow-y-auto space-y-6 pr-2">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Gerador em lote */}
              <div className="rounded-2xl glass-soft p-5 space-y-3">
                <h3 className="font-display font-semibold text-sm">Gerar Mesas em Lote</h3>
                <p className="text-xs text-muted-foreground">
                  Gera sequencialmente até a quantidade especificada (ex: 1 a 12). Mesas já
                  existentes são preservadas.
                </p>
                <div className="flex items-center gap-3">
                  <Input
                    type="number"
                    min="1"
                    max="100"
                    value={generateCount}
                    onChange={(e) => setGenerateCount(e.target.value)}
                    className="w-28 rounded-xl bg-background text-sm"
                    placeholder="Ex: 12"
                  />
                  <Button
                    type="button"
                    onClick={handleGenerateTables}
                    className="rounded-xl bg-brand font-semibold text-brand-foreground"
                  >
                    Gerar Mesas
                  </Button>
                </div>
              </div>

              {/* Criar Mesa Individual */}
              <div className="rounded-2xl glass-soft p-5 space-y-3 flex flex-col justify-between">
                <div>
                  <h3 className="font-display font-semibold text-sm">Adicionar Mesa Individual</h3>
                  <p className="text-xs text-muted-foreground">
                    Crie uma mesa específica informando número, capacidade e garçom padrão.
                  </p>
                </div>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setIsNewTableOpen(true)}
                  className="rounded-xl w-fit flex items-center gap-2"
                >
                  <Plus className="size-4" />
                  Nova Mesa
                </Button>
              </div>
            </div>

            {/* Listagem de Mesas */}
            <div className="rounded-2xl glass-soft p-5 space-y-3">
              <div className="flex items-center justify-between mb-2">
                <h3 className="font-display font-semibold text-sm">
                  Mesas Cadastradas ({tables.length})
                </h3>
              </div>

              {tablesLoading ? (
                <div className="py-8 text-center text-xs text-muted-foreground flex items-center justify-center gap-2">
                  <RefreshCw className="size-4 animate-spin" /> Carregando mesas do SQLite...
                </div>
              ) : tables.length === 0 ? (
                <div className="py-12 text-center text-xs text-muted-foreground">
                  Nenhuma mesa cadastrada. Utilize o gerador acima para criar suas primeiras mesas.
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
                  {tables.map((t) => {
                    const liveTable = pos.tables.find((pt) => pt.id === t.id) ?? t;
                    const isOccupied =
                      liveTable.status !== "livre" ||
                      (liveTable.items && liveTable.items.length > 0);

                    return (
                      <div
                        key={t.id}
                        className={cn(
                          "rounded-xl border p-3 flex flex-col justify-between space-y-2 transition-all",
                          isOccupied
                            ? "border-busy/40 bg-busy/5 ring-1 ring-busy/20"
                            : "border-border/50 bg-background/60",
                        )}
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-display font-bold text-base flex items-center gap-1.5">
                            Mesa {t.number}
                            {isOccupied && (
                              <span
                                className="size-2 rounded-full bg-busy animate-pulse"
                                title="Mesa aberta com comanda"
                              />
                            )}
                          </span>
                          <span className="text-[10px] px-2 py-0.5 rounded-md bg-secondary text-muted-foreground">
                            {t.seats} lug.
                          </span>
                        </div>
                        <div className="flex items-center justify-between text-xs text-muted-foreground truncate">
                          <span className="truncate">
                            {isOccupied ? `Garçom: ${liveTable.waiter}` : t.waiter}
                          </span>
                          {isOccupied && (
                            <span className="text-[10px] font-semibold text-busy shrink-0">
                              Ocupada
                            </span>
                          )}
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          disabled={isOccupied}
                          onClick={() => handleDeleteTableClick({ id: t.id, number: t.number })}
                          className={cn(
                            "h-8 w-full rounded-lg text-xs",
                            isOccupied
                              ? "opacity-50 cursor-not-allowed text-muted-foreground bg-secondary/30"
                              : "text-wait hover:bg-wait/10 hover:text-wait",
                          )}
                          title={
                            isOccupied
                              ? "Esta mesa está em atendimento e não pode ser removida"
                              : "Remover mesa vazia"
                          }
                        >
                          <Trash2 className="size-3.5 mr-1" />
                          {isOccupied ? "Em Atendimento" : "Remover"}
                        </Button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </TabsContent>

          {/* =========================================================
              ABA 2: MOTOBOYS (COURIERS)
             ========================================================= */}
          <TabsContent value="motoboys" className="flex-1 min-h-0 overflow-y-auto space-y-4 pr-2">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-display font-semibold text-base">Entregadores / Motoboys</h3>
                <p className="text-xs text-muted-foreground">
                  Gerencie os motoboys disponíveis para expedição no delivery.
                </p>
              </div>
              <Button
                type="button"
                onClick={() => {
                  setCourierEditingId(null);
                  setCourierName("");
                  setCourierPhone("");
                  setIsCourierModalOpen(true);
                }}
                className="rounded-xl bg-brand text-brand-foreground flex items-center gap-2"
              >
                <Plus className="size-4" /> Novo Motoboy
              </Button>
            </div>

            {couriersLoading ? (
              <div className="py-12 text-center text-xs text-muted-foreground flex items-center justify-center gap-2">
                <RefreshCw className="size-4 animate-spin" /> Carregando motoboys...
              </div>
            ) : couriers.length === 0 ? (
              <div className="py-16 text-center text-xs text-muted-foreground rounded-2xl glass-soft">
                <Bike className="size-10 mx-auto text-muted-foreground/50 mb-2" />
                Nenhum entregador cadastrado no momento. Clique em "Novo Motoboy" para cadastrar.
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                {couriers.map((c) => (
                  <div
                    key={c.id}
                    className="rounded-2xl glass-soft p-4 flex flex-col justify-between space-y-3"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-3">
                        <div className="size-10 rounded-xl bg-cyan/15 text-cyan grid place-items-center">
                          <Bike className="size-5" />
                        </div>
                        <div>
                          <h4 className="font-semibold text-sm">{c.name}</h4>
                          <p className="text-xs text-muted-foreground">{c.phone}</p>
                        </div>
                      </div>
                      <span
                        className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${
                          c.is_active ? "bg-free/15 text-free" : "bg-wait/15 text-wait"
                        }`}
                      >
                        {c.is_active ? "Ativo" : "Inativo"}
                      </span>
                    </div>

                    <div className="flex items-center justify-between pt-2 border-t border-border/40">
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground">Disponível</span>
                        <Switch
                          checked={Boolean(c.is_active)}
                          onCheckedChange={() => toggleCourierActive(c.id)}
                        />
                      </div>
                      <div className="flex items-center gap-1">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => openEditCourier(c)}
                          className="size-8 rounded-lg"
                        >
                          <Edit2 className="size-3.5" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => handleDeleteCourierClick({ id: c.id, name: c.name })}
                          className="size-8 rounded-lg text-wait hover:bg-wait/10 hover:text-wait"
                        >
                          <Trash2 className="size-3.5" />
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </TabsContent>

          {/* =========================================================
              ABA 3: CARDÁPIO (PRODUTOS & CATEGORIAS)
             ========================================================= */}
          <TabsContent value="cardapio" className="flex-1 min-h-0 overflow-y-auto space-y-5 pr-2">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="font-display font-semibold text-base">Gestão do Cardápio</h3>
                <p className="text-xs text-muted-foreground">
                  Cadastre e edite categorias, produtos, preços e controle de estoque.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setIsCategoryModalOpen(true)}
                  className="rounded-xl flex items-center gap-2 text-xs"
                >
                  <Plus className="size-3.5" /> Nova Categoria
                </Button>
                <Button
                  type="button"
                  onClick={openNewProduct}
                  className="rounded-xl bg-brand text-brand-foreground flex items-center gap-2 text-xs font-semibold"
                >
                  <Plus className="size-3.5" /> Novo Produto
                </Button>
              </div>
            </div>

            {/* Filtro de categorias */}
            <div className="flex items-center gap-2 overflow-x-auto pb-1">
              {categories.map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setMenuSelectedCategory(cat)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all ${
                    menuSelectedCategory === cat
                      ? "bg-brand text-brand-foreground shadow-sm"
                      : "bg-secondary text-muted-foreground hover:bg-surface-strong"
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>

            {/* Listagem de produtos */}
            {productsLoading ? (
              <div className="py-12 text-center text-xs text-muted-foreground flex items-center justify-center gap-2">
                <RefreshCw className="size-4 animate-spin" /> Carregando produtos...
              </div>
            ) : filteredProducts.length === 0 ? (
              <div className="py-16 text-center text-xs text-muted-foreground rounded-2xl glass-soft">
                <UtensilsCrossed className="size-10 mx-auto text-muted-foreground/50 mb-2" />
                Nenhum produto cadastrado nesta categoria.
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                {filteredProducts.map((p) => (
                  <div
                    key={p.id}
                    className="rounded-2xl glass-soft p-4 flex flex-col justify-between space-y-3"
                  >
                    <div className="flex items-start gap-3">
                      <span className="text-3xl">{p.emoji}</span>
                      <div className="min-w-0 flex-1">
                        <h4 className="font-semibold text-sm truncate">{p.name}</h4>
                        <p className="text-xs text-muted-foreground">{p.category}</p>
                        <p className="num font-bold text-cyan mt-1">{brl(p.price)}</p>

                        <div className="flex items-center gap-1.5 flex-wrap text-[11px] text-muted-foreground mt-2">
                          {p.customization?.allowCustomization ? (
                            <>
                              <span className="inline-flex items-center gap-1 rounded bg-brand/15 text-brand px-1.5 py-0.5 text-[10px] font-semibold ring-1 ring-brand/30">
                                {p.customization.addons?.length ?? 0} adicionais
                              </span>
                              {p.customization.exclusions &&
                                p.customization.exclusions.length > 0 && (
                                  <span className="inline-flex items-center gap-1 rounded bg-secondary px-1.5 py-0.5 text-[10px] text-muted-foreground">
                                    {p.customization.exclusions.length} exclusões
                                  </span>
                                )}
                              {p.customization.isPizza && (
                                <span className="inline-flex items-center gap-1 rounded bg-cyan/15 text-cyan px-1.5 py-0.5 text-[10px] font-semibold">
                                  🍕 Meio a meio
                                </span>
                              )}
                            </>
                          ) : (
                            <span className="text-[10px] text-muted-foreground/70 italic">
                              Item simples
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center justify-between pt-2 border-t border-border/40">
                      <span
                        className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${
                          p.soldOut ? "bg-wait/15 text-wait" : "bg-free/15 text-free"
                        }`}
                      >
                        {p.soldOut ? "Pausado (86)" : "Ativo"}
                      </span>
                      <div className="flex items-center gap-1">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => openEditProduct(p)}
                          className="size-8 rounded-lg"
                        >
                          <Edit2 className="size-3.5" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => handleDeleteProductClick({ id: p.id, name: p.name })}
                          className="size-8 rounded-lg text-wait hover:bg-wait/10 hover:text-wait"
                        >
                          <Trash2 className="size-3.5" />
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </TabsContent>

          {/* =========================================================
              ABA 4: IMPRESSORAS TÉRMICAS (COZINHA & BALCÃO/CAIXA)
             ========================================================= */}
          <TabsContent value="impressora" className="flex-1 min-h-0 overflow-y-auto space-y-6 pr-2">
            <Tabs defaultValue="cozinha" className="w-full">
              <TabsList className="grid grid-cols-2 max-w-md bg-muted/60 p-1 rounded-2xl mb-6">
                <TabsTrigger value="cozinha" className="rounded-xl text-xs font-semibold gap-2">
                  <ChefHat className="size-3.5" /> Cozinha & Bar (Produção)
                </TabsTrigger>
                <TabsTrigger value="balcao" className="rounded-xl text-xs font-semibold gap-2">
                  <Receipt className="size-3.5" /> Balcão & Caixa (Pré-Conta)
                </TabsTrigger>
              </TabsList>

              {/* SUB-ABA 1: COZINHA E BAR */}
              <TabsContent value="cozinha" className="space-y-6">
                {/* Card Principal - Status e Ativação */}
                <div className="rounded-2xl glass-soft p-5 space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <div className="p-3 rounded-2xl bg-brand/10 text-brand">
                        <ChefHat className="size-6" />
                      </div>
                      <div>
                        <h3 className="font-display font-semibold text-base">
                          Impressora da Cozinha / Produção
                        </h3>
                        <p className="text-xs text-muted-foreground">
                          Comunicação direta via rede local (TCP / ESC/POS) para impressão de comandas
                          sem depender de diálogo do navegador.
                        </p>
                      </div>
                    </div>

                    {/* Badge de Conexão */}
                    <div className="flex items-center gap-2 self-start sm:self-auto">
                      {!printerEnabled ? (
                        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-muted/50 text-muted-foreground border border-border">
                          <WifiOff className="size-3.5" />
                          Desativada
                        </span>
                      ) : printerTestStatus === "success" ? (
                        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30">
                          <CheckCircle2 className="size-3.5" />
                          Conectada {printerLatency !== null ? `(${printerLatency}ms)` : ""}
                        </span>
                      ) : printerTestStatus === "error" ? (
                        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-destructive/15 text-destructive border border-destructive/30">
                          <AlertCircle className="size-3.5" />
                          Falha na Conexão
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-brand/15 text-brand border border-brand/30">
                          <Wifi className="size-3.5" />
                          Ativa ({printerIp || "Sem IP"})
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="border-t border-border/40 pt-4 flex items-center justify-between">
                    <div>
                      <label
                        className="text-sm font-semibold cursor-pointer"
                        htmlFor="printer-enable-toggle"
                      >
                        Habilitar Impressão de Rede para Cozinha
                      </label>
                      <p className="text-xs text-muted-foreground">
                        Quando desativado, o sistema continuará gerando a comanda através da caixa de
                        impressão padrão do sistema.
                      </p>
                    </div>
                    <Switch
                      id="printer-enable-toggle"
                      checked={printerEnabled}
                      onCheckedChange={setPrinterEnabled}
                    />
                  </div>
                </div>

                {/* Parâmetros de Conexão e Hardware */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Endereço IP */}
                  <div className="rounded-2xl glass-soft p-5 space-y-3">
                    <div className="flex items-center justify-between">
                      <h4 className="font-display font-semibold text-sm">Endereço IP da Impressora</h4>
                      <span className="text-[11px] text-muted-foreground">IPv4</span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      IP fixo ou reservado no roteador para a impressora térmica conectada via cabo de
                      rede (Ethernet) ou Wi-Fi.
                    </p>
                    <Input
                      type="text"
                      value={printerIp}
                      onChange={(e) => setPrinterIp(e.target.value)}
                      placeholder="Ex: 192.168.1.200"
                      className={cn(
                        "rounded-xl bg-background text-sm font-mono",
                        printerIp.trim() &&
                          !isValidIpv4(printerIp) &&
                          "border-destructive focus-visible:ring-destructive",
                      )}
                    />
                    {printerIp.trim() && !isValidIpv4(printerIp) ? (
                      <p className="text-xs text-destructive flex items-center gap-1">
                        <AlertCircle className="size-3" />
                        Formato IPv4 inválido (exemplo válido: 192.168.1.200)
                      </p>
                    ) : printerIp.trim() ? (
                      <p className="text-xs text-muted-foreground flex items-center gap-1">
                        <Check className="size-3 text-emerald-500" />
                        Formato de IP válido
                      </p>
                    ) : null}
                  </div>

                  {/* Porta TCP */}
                  <div className="rounded-2xl glass-soft p-5 space-y-3">
                    <div className="flex items-center justify-between">
                      <h4 className="font-display font-semibold text-sm">Porta de Comunicação TCP</h4>
                      <span className="text-[11px] text-muted-foreground">Raw Socket</span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Porta TCP padrão para o protocolo direto ESC/POS (a imensa maioria dos modelos
                      Epson, Elgin e Bematech utiliza a porta 9100).
                    </p>
                    <Input
                      type="number"
                      min="1"
                      max="65535"
                      value={printerPort}
                      onChange={(e) => setPrinterPort(e.target.value)}
                      placeholder="9100"
                      className="rounded-xl bg-background text-sm font-mono"
                    />
                  </div>

                  {/* Largura da Bobina */}
                  <div className="rounded-2xl glass-soft p-5 space-y-3">
                    <h4 className="font-display font-semibold text-sm">Largura da Bobina de Papel</h4>
                    <p className="text-xs text-muted-foreground">
                      Define o número de colunas por linha para diagramação otimizada das comandas de
                      produção.
                    </p>
                    <div className="grid grid-cols-2 gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => setPrinterPaperWidth("80mm")}
                        className={cn(
                          "p-3 rounded-xl border text-left transition-all",
                          printerPaperWidth === "80mm"
                            ? "border-brand bg-brand/10 text-foreground font-semibold ring-1 ring-brand"
                            : "border-border/60 hover:bg-muted/40 text-muted-foreground",
                        )}
                      >
                        <div className="text-sm font-semibold">80 mm (Padrão)</div>
                        <div className="text-xs text-muted-foreground mt-0.5">48 colunas por linha</div>
                      </button>
                      <button
                        type="button"
                        onClick={() => setPrinterPaperWidth("58mm")}
                        className={cn(
                          "p-3 rounded-xl border text-left transition-all",
                          printerPaperWidth === "58mm"
                            ? "border-brand bg-brand/10 text-foreground font-semibold ring-1 ring-brand"
                            : "border-border/60 hover:bg-muted/40 text-muted-foreground",
                        )}
                      >
                        <div className="text-sm font-semibold">58 mm (Compacta)</div>
                        <div className="text-xs text-muted-foreground mt-0.5">32 colunas por linha</div>
                      </button>
                    </div>
                  </div>

                  {/* Impressão Automática */}
                  <div className="rounded-2xl glass-soft p-5 space-y-3 flex flex-col justify-between">
                    <div>
                      <h4 className="font-display font-semibold text-sm">Disparo Automático</h4>
                      <p className="text-xs text-muted-foreground mt-1">
                        Gera a impressão imediata da rodada no momento exato em que o garçom ou operador
                        clica em &quot;Enviar para Cozinha&quot;.
                      </p>
                    </div>
                    <div className="flex items-center justify-between pt-2 border-t border-border/40">
                      <span className="text-xs font-medium">Imprimir automaticamente na cozinha</span>
                      <Switch checked={printerAutoPrint} onCheckedChange={setPrinterAutoPrint} />
                    </div>
                  </div>
                </div>

                {/* Testes, Diagnóstico e Ações */}
                <div className="rounded-2xl glass-soft p-5 space-y-4">
                  <div>
                    <h4 className="font-display font-semibold text-sm">
                      Diagnóstico e Teste de Impressão da Cozinha
                    </h4>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Teste o canal de comunicação para assegurar que a impressora está respondendo e
                      pronta para imprimir durante os turnos.
                    </p>
                  </div>

                  {/* Feedback visual do teste */}
                  {printerTestMessage && (
                    <div
                      className={cn(
                        "p-3 rounded-xl border text-xs flex items-center gap-2",
                        printerTestStatus === "success"
                          ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-700 dark:text-emerald-300"
                          : "bg-destructive/10 border-destructive/30 text-destructive",
                      )}
                    >
                      {printerTestStatus === "success" ? (
                        <CheckCircle2 className="size-4 shrink-0 text-emerald-500" />
                      ) : (
                        <AlertCircle className="size-4 shrink-0 text-destructive" />
                      )}
                      <span>{printerTestMessage}</span>
                    </div>
                  )}

                  <div className="flex flex-wrap items-center gap-3 pt-2">
                    <Button
                      type="button"
                      variant="outline"
                      disabled={isTestingPrinter || isPrintingTestTicket}
                      onClick={handleTestConnection}
                      className="rounded-xl text-xs font-semibold gap-2"
                    >
                      {isTestingPrinter ? (
                        <RefreshCw className="size-3.5 animate-spin" />
                      ) : (
                        <Wifi className="size-3.5" />
                      )}
                      {isTestingPrinter ? "Testando Socket..." : "Testar Conexão"}
                    </Button>

                    <Button
                      type="button"
                      variant="outline"
                      disabled={isTestingPrinter || isPrintingTestTicket}
                      onClick={handlePrintTestTicket}
                      className="rounded-xl text-xs font-semibold gap-2"
                    >
                      {isPrintingTestTicket ? (
                        <RefreshCw className="size-3.5 animate-spin" />
                      ) : (
                        <Printer className="size-3.5" />
                      )}
                      {isPrintingTestTicket ? "Enviando Cupom..." : "Imprimir Cupom de Teste"}
                    </Button>

                    <Button
                      type="button"
                      disabled={isSavingPrinter}
                      onClick={handleSavePrinterConfig}
                      className="rounded-xl bg-brand text-brand-foreground font-semibold text-xs gap-2 ml-auto"
                    >
                      {isSavingPrinter ? (
                        <RefreshCw className="size-3.5 animate-spin" />
                      ) : (
                        <Check className="size-3.5" />
                      )}
                      {isSavingPrinter ? "Salvando..." : "Salvar Configurações"}
                    </Button>
                  </div>
                </div>

                {/* Informações Técnicas */}
                <div className="rounded-2xl border border-border/50 bg-secondary/30 p-5 space-y-2 text-xs text-muted-foreground">
                  <h5 className="font-semibold text-foreground flex items-center gap-1.5">
                    <Sliders className="size-3.5 text-brand" />
                    Notas Técnicas da Impressora de Cozinha:
                  </h5>
                  <ul className="list-disc pl-5 space-y-1.5">
                    <li>
                      <strong>Protocolo:</strong> Utiliza comandos nativos ESC/POS (inicialização,
                      negrito, caracteres em tamanho duplo e guilhotina automática).
                    </li>
                    <li>
                      <strong>Compatibilidade:</strong> Compatível com Epson TM-T20X, TM-T88, Elgin
                      i7/i9, Bematech MP-4200 TH, Xprinter, Daruma e demais impressoras térmicas ESC/POS
                      de rede.
                    </li>
                    <li>
                      <strong>Tolerância a Falhas:</strong> Caso a impressora de rede esteja sem papel,
                      desligada ou inacessível, o PDV automaticamente recorre ao spooler HTML nativo do
                      sistema para que o pedido não seja extraviado.
                    </li>
                  </ul>
                </div>
              </TabsContent>

              {/* SUB-ABA 2: BALCÃO / CAIXA (PRÉ-CONTA E RECIBOS) */}
              <TabsContent value="balcao" className="space-y-6">
                {/* Card Principal - Status e Ativação do Balcão */}
                <div className="rounded-2xl glass-soft p-5 space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <div className="p-3 rounded-2xl bg-brand/10 text-brand">
                        <Receipt className="size-6" />
                      </div>
                      <div>
                        <h3 className="font-display font-semibold text-base">
                          Impressora do Balcão / Caixa & Salão
                        </h3>
                        <p className="text-xs text-muted-foreground">
                          Impressão direta de Pré-Contas (conferência de mesa), comprovantes de venda
                          e relatórios de fechamento de caixa via rede local (TCP / ESC/POS).
                        </p>
                      </div>
                    </div>

                    {/* Badge de Conexão */}
                    <div className="flex items-center gap-2 self-start sm:self-auto">
                      {!counterPrinterEnabled ? (
                        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-muted/50 text-muted-foreground border border-border">
                          <WifiOff className="size-3.5" />
                          Desativada
                        </span>
                      ) : counterPrinterTestStatus === "success" ? (
                        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30">
                          <CheckCircle2 className="size-3.5" />
                          Conectada {counterPrinterLatency !== null ? `(${counterPrinterLatency}ms)` : ""}
                        </span>
                      ) : counterPrinterTestStatus === "error" ? (
                        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-destructive/15 text-destructive border border-destructive/30">
                          <AlertCircle className="size-3.5" />
                          Falha na Conexão
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-brand/15 text-brand border border-brand/30">
                          <Wifi className="size-3.5" />
                          Ativa ({counterPrinterUseKitchen ? `${printerIp} (Cozinha)` : (counterPrinterIp || "Sem IP")})
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="border-t border-border/40 pt-4 flex items-center justify-between">
                    <div>
                      <label
                        className="text-sm font-semibold cursor-pointer"
                        htmlFor="counter-printer-enable-toggle"
                      >
                        Habilitar Impressão de Rede para Balcão / Caixa
                      </label>
                      <p className="text-xs text-muted-foreground">
                        Quando desativado, pré-contas e recibos serão gerados através do diálogo de impressão padrão do sistema.
                      </p>
                    </div>
                    <Switch
                      id="counter-printer-enable-toggle"
                      checked={counterPrinterEnabled}
                      onCheckedChange={setCounterPrinterEnabled}
                    />
                  </div>
                </div>

                {/* Opção de Compartilhamento com a Cozinha */}
                <div className="rounded-2xl glass-soft p-5 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="font-display font-semibold text-sm">
                        Compartilhar Impressora da Cozinha (Impressora Única)
                      </h4>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Ative caso o seu restaurante tenha apenas 1 impressora física de rede para atender tanto a cozinha quanto as pré-contas do caixa.
                      </p>
                    </div>
                    <Switch
                      checked={counterPrinterUseKitchen}
                      onCheckedChange={setCounterPrinterUseKitchen}
                    />
                  </div>
                  {counterPrinterUseKitchen && (
                    <div className="mt-2 p-3 rounded-xl border border-brand/30 bg-brand/5 text-xs text-foreground flex items-center gap-2">
                      <Check className="size-4 text-brand shrink-0" />
                      <span>
                        As pré-contas e comprovantes serão enviados para a mesma impressora configurada na aba Cozinha:{" "}
                        <strong className="font-mono">{printerIp || "192.168.1.200"}:{printerPort || "9100"}</strong>.
                      </span>
                    </div>
                  )}
                </div>

                {/* Parâmetros de Conexão Dedicados (se não compartilhar) */}
                {!counterPrinterUseKitchen && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Endereço IP do Balcão */}
                    <div className="rounded-2xl glass-soft p-5 space-y-3">
                      <div className="flex items-center justify-between">
                        <h4 className="font-display font-semibold text-sm">Endereço IP da Impressora de Balcão</h4>
                        <span className="text-[11px] text-muted-foreground">IPv4</span>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        IP fixo da impressora térmica que fica no caixa ou balcão do salão.
                      </p>
                      <Input
                        type="text"
                        value={counterPrinterIp}
                        onChange={(e) => setCounterPrinterIp(e.target.value)}
                        placeholder="Ex: 192.168.1.201"
                        className={cn(
                          "rounded-xl bg-background text-sm font-mono",
                          counterPrinterIp.trim() &&
                            !isValidIpv4(counterPrinterIp) &&
                            "border-destructive focus-visible:ring-destructive",
                        )}
                      />
                      {counterPrinterIp.trim() && !isValidIpv4(counterPrinterIp) ? (
                        <p className="text-xs text-destructive flex items-center gap-1">
                          <AlertCircle className="size-3" />
                          Formato IPv4 inválido (exemplo válido: 192.168.1.201)
                        </p>
                      ) : counterPrinterIp.trim() ? (
                        <p className="text-xs text-muted-foreground flex items-center gap-1">
                          <Check className="size-3 text-emerald-500" />
                          Formato de IP válido
                        </p>
                      ) : null}
                    </div>

                    {/* Porta TCP do Balcão */}
                    <div className="rounded-2xl glass-soft p-5 space-y-3">
                      <div className="flex items-center justify-between">
                        <h4 className="font-display font-semibold text-sm">Porta de Comunicação TCP</h4>
                        <span className="text-[11px] text-muted-foreground">Raw Socket</span>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Porta TCP padrão para conexão direta ESC/POS (padrão de mercado: 9100).
                      </p>
                      <Input
                        type="number"
                        min="1"
                        max="65535"
                        value={counterPrinterPort}
                        onChange={(e) => setCounterPrinterPort(e.target.value)}
                        placeholder="9100"
                        className="rounded-xl bg-background text-sm font-mono"
                      />
                    </div>
                  </div>
                )}

                {/* Preferências de Bobina e Conferência (Pré-Conta) */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Largura da Bobina */}
                  <div className="rounded-2xl glass-soft p-5 space-y-3">
                    <h4 className="font-display font-semibold text-sm">Largura da Bobina de Papel</h4>
                    <p className="text-xs text-muted-foreground">
                      Define a formatação e número de colunas para diagramação da pré-conta e dos comprovantes de venda.
                    </p>
                    <div className="grid grid-cols-2 gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => setCounterPrinterPaperWidth("80mm")}
                        className={cn(
                          "p-3 rounded-xl border text-left transition-all",
                          counterPrinterPaperWidth === "80mm"
                            ? "border-brand bg-brand/10 text-foreground font-semibold ring-1 ring-brand"
                            : "border-border/60 hover:bg-muted/40 text-muted-foreground",
                        )}
                      >
                        <div className="text-sm font-semibold">80 mm (Padrão)</div>
                        <div className="text-xs text-muted-foreground mt-0.5">48 colunas por linha</div>
                      </button>
                      <button
                        type="button"
                        onClick={() => setCounterPrinterPaperWidth("58mm")}
                        className={cn(
                          "p-3 rounded-xl border text-left transition-all",
                          counterPrinterPaperWidth === "58mm"
                            ? "border-brand bg-brand/10 text-foreground font-semibold ring-1 ring-brand"
                            : "border-border/60 hover:bg-muted/40 text-muted-foreground",
                        )}
                      >
                        <div className="text-sm font-semibold">58 mm (Compacta)</div>
                        <div className="text-xs text-muted-foreground mt-0.5">32 colunas por linha</div>
                      </button>
                    </div>
                  </div>

                  {/* Taxa de Serviço na Pré-Conta */}
                  <div className="rounded-2xl glass-soft p-5 space-y-3 flex flex-col justify-between">
                    <div>
                      <h4 className="font-display font-semibold text-sm">Taxa de Serviço Sugerida (Garçom)</h4>
                      <p className="text-xs text-muted-foreground mt-1">
                        Exibe no cupom de pré-conta o cálculo facultativo da taxa de atendimento e a discriminação dos totais com e sem a taxa.
                      </p>
                    </div>

                    <div className="space-y-3 pt-2 border-t border-border/40">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-medium">Sugerir taxa de serviço na pré-conta</span>
                        <Switch
                          checked={counterIncludeServiceFee}
                          onCheckedChange={setCounterIncludeServiceFee}
                        />
                      </div>
                      {counterIncludeServiceFee && (
                        <div className="flex items-center justify-between gap-3 pt-1">
                          <span className="text-xs text-muted-foreground">Porcentagem padrão (%):</span>
                          <Input
                            type="number"
                            min="0"
                            max="100"
                            value={counterServiceFeePercent}
                            onChange={(e) => setCounterServiceFeePercent(e.target.value)}
                            placeholder="10"
                            className="w-24 rounded-xl bg-background text-sm font-mono text-center"
                          />
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Testes, Diagnóstico e Ações do Balcão */}
                <div className="rounded-2xl glass-soft p-5 space-y-4">
                  <div>
                    <h4 className="font-display font-semibold text-sm">
                      Diagnóstico e Teste de Impressão do Balcão
                    </h4>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Verifique a conexão de rede da impressora de balcão e imprima um cupom de teste.
                    </p>
                  </div>

                  {/* Feedback visual do teste */}
                  {counterPrinterTestMessage && (
                    <div
                      className={cn(
                        "p-3 rounded-xl border text-xs flex items-center gap-2",
                        counterPrinterTestStatus === "success"
                          ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-700 dark:text-emerald-300"
                          : "bg-destructive/10 border-destructive/30 text-destructive",
                      )}
                    >
                      {counterPrinterTestStatus === "success" ? (
                        <CheckCircle2 className="size-4 shrink-0 text-emerald-500" />
                      ) : (
                        <AlertCircle className="size-4 shrink-0 text-destructive" />
                      )}
                      <span>{counterPrinterTestMessage}</span>
                    </div>
                  )}

                  <div className="flex flex-wrap items-center gap-3 pt-2">
                    <Button
                      type="button"
                      variant="outline"
                      disabled={isTestingCounterPrinter || isPrintingCounterTestTicket}
                      onClick={handleTestCounterConnection}
                      className="rounded-xl text-xs font-semibold gap-2"
                    >
                      {isTestingCounterPrinter ? (
                        <RefreshCw className="size-3.5 animate-spin" />
                      ) : (
                        <Wifi className="size-3.5" />
                      )}
                      {isTestingCounterPrinter ? "Testando Socket..." : "Testar Conexão"}
                    </Button>

                    <Button
                      type="button"
                      variant="outline"
                      disabled={isTestingCounterPrinter || isPrintingCounterTestTicket}
                      onClick={handlePrintCounterTestTicket}
                      className="rounded-xl text-xs font-semibold gap-2"
                    >
                      {isPrintingCounterTestTicket ? (
                        <RefreshCw className="size-3.5 animate-spin" />
                      ) : (
                        <Printer className="size-3.5" />
                      )}
                      {isPrintingCounterTestTicket ? "Enviando Cupom..." : "Imprimir Cupom de Teste (Balcão)"}
                    </Button>

                    <Button
                      type="button"
                      disabled={isSavingCounterPrinter}
                      onClick={handleSaveCounterPrinterConfig}
                      className="rounded-xl bg-brand text-brand-foreground font-semibold text-xs gap-2 ml-auto"
                    >
                      {isSavingCounterPrinter ? (
                        <RefreshCw className="size-3.5 animate-spin" />
                      ) : (
                        <Check className="size-3.5" />
                      )}
                      {isSavingCounterPrinter ? "Salvando..." : "Salvar Configurações"}
                    </Button>
                  </div>
                </div>

                {/* Informações Técnicas do Balcão */}
                <div className="rounded-2xl border border-border/50 bg-secondary/30 p-5 space-y-2 text-xs text-muted-foreground">
                  <h5 className="font-semibold text-foreground flex items-center gap-1.5">
                    <Sliders className="size-3.5 text-brand" />
                    Notas Técnicas da Impressora de Balcão e Pré-Conta:
                  </h5>
                  <ul className="list-disc pl-5 space-y-1.5">
                    <li>
                      <strong>Finalidade da Pré-Conta:</strong> Documento não fiscal entregue na mesa para simples conferência de consumo antes do fechamento financeiro, contendo itens, subtotais e divisão sugerida por pessoa.
                    </li>
                    <li>
                      <strong>Compatibilidade ESC/POS:</strong> Funciona em qualquer impressora térmica de 80mm ou 58mm conectada na rede local com suporte à porta TCP 9100.
                    </li>
                    <li>
                      <strong>Fallback Seguro:</strong> Se a impressora estiver offline ou sem papel, o PDV gera a pré-conta no diálogo de impressão do sistema automaticamente.
                    </li>
                  </ul>
                </div>
              </TabsContent>
            </Tabs>
          </TabsContent>

          {/* =========================================================
              ABA 5: IFOOD (INTEGRAÇÃO OMNICHANNEL & DELIVERY)
             ========================================================= */}
          <TabsContent value="ifood" className="flex-1 min-h-0 overflow-y-auto space-y-6 pr-2">
            {/* Card Principal - Status da Loja */}
            <div className="rounded-2xl glass-soft p-5 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="p-3 rounded-2xl bg-ifood/15 text-ifood">
                    <ShoppingBag className="size-6" />
                  </div>
                  <div>
                    <h3 className="font-display font-semibold text-base flex items-center gap-2">
                      iFood Merchant API
                      <span className="text-[11px] px-2 py-0.5 rounded-full bg-ifood/15 text-ifood font-bold">
                        Delivery Oficial
                      </span>
                    </h3>
                    <p className="text-xs text-muted-foreground">
                      Conexão em tempo real com a plataforma iFood para recepção de pedidos,
                      auto-aceite e impressão automática na cozinha.
                    </p>
                  </div>
                </div>

                {/* Badge de Status da Loja */}
                <div className="flex items-center gap-2 self-start sm:self-auto">
                  {pos.ifoodPaused ? (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-wait/15 text-wait border border-wait/30">
                      <Pause className="size-3.5" />
                      Loja Pausada no iFood
                    </span>
                  ) : !ifoodEnabled ? (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-muted/50 text-muted-foreground border border-border">
                      Módulo Desativado
                    </span>
                  ) : ifoodTestResult.status === "success" ? (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30">
                      <CheckCircle2 className="size-3.5" />
                      Conectado e Operacional
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-free/15 text-free border border-free/30">
                      <Play className="size-3.5" />
                      Loja Aberta
                    </span>
                  )}
                </div>
              </div>

              <div className="border-t border-border/40 pt-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <label
                    className="text-sm font-semibold cursor-pointer"
                    htmlFor="ifood-enabled-toggle"
                  >
                    Habilitar Integração com iFood
                  </label>
                  <p className="text-xs text-muted-foreground">
                    Ativa o módulo de delivery conectado para receber pedidos da plataforma.
                  </p>
                </div>
                <Switch
                  id="ifood-enabled-toggle"
                  checked={ifoodEnabled}
                  onCheckedChange={setIfoodEnabled}
                />
              </div>

              <div className="border-t border-border/40 pt-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <span className="text-sm font-semibold">
                    Pausar Loja no iFood (Horário de Pico / Emergência)
                  </span>
                  <p className="text-xs text-muted-foreground">
                    Interrompe temporariamente a chegada de novos pedidos pelo aplicativo do iFood.
                  </p>
                </div>
                <Button
                  type="button"
                  onClick={() => pos.toggleIfood()}
                  variant={pos.ifoodPaused ? "default" : "secondary"}
                  className={cn(
                    "rounded-xl text-xs font-semibold gap-2",
                    pos.ifoodPaused && "bg-free hover:bg-free/90 text-free-foreground",
                  )}
                >
                  {pos.ifoodPaused ? <Play className="size-3.5" /> : <Pause className="size-3.5" />}
                  {pos.ifoodPaused ? "Reabrir Loja no iFood" : "Pausar Loja no iFood"}
                </Button>
              </div>
            </div>

            {/* Parâmetros de Credenciais da API iFood */}
            <div className="rounded-2xl glass-soft p-5 space-y-4">
              <div>
                <h4 className="font-display font-semibold text-sm">
                  Credenciais do Portal do Desenvolvedor
                </h4>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Informe as chaves geradas no portal iFood for Developers para autenticação OAuth2.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* Merchant ID */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-semibold text-muted-foreground block">
                      Merchant ID (ID da Loja)
                    </label>
                      {ifoodMerchantId.trim().length > 0 && (
                        <span
                          className={cn(
                            "text-[10px] font-mono px-1.5 py-0.5 rounded",
                            ifoodMerchantId.trim().length === 36
                              ? "bg-free/15 text-free"
                              : "bg-wait/15 text-wait"
                          )}
                        >
                          {ifoodMerchantId.trim().length}/36 caracteres
                        </span>
                      )}
                    </div>
                    <Input
                      type="text"
                      value={ifoodMerchantId}
                      onChange={(e) => setIfoodMerchantId(e.target.value.trim())}
                      placeholder="Ex: a1b2c3d4-e5f6-7890-abcd-ef1234567890"
                      className="rounded-xl bg-background text-sm font-mono"
                    />
                    <span className="text-[10px] text-muted-foreground">
                      UUID de 36 caracteres fornecido na aba de Lojas/Merchants do iFood
                    </span>
                  </div>

                  {/* Client ID */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-semibold text-muted-foreground block">
                        Client ID (Público)
                      </label>
                      {ifoodClientId.trim().length > 0 && (
                        <span
                          className={cn(
                            "text-[10px] font-mono px-1.5 py-0.5 rounded",
                            ifoodClientId.trim().length === 36
                              ? "bg-free/15 text-free"
                              : "bg-wait/15 text-wait font-semibold"
                          )}
                        >
                          {ifoodClientId.trim().length}/36 caracteres
                        </span>
                      )}
                    </div>
                    <Input
                      type="text"
                      value={ifoodClientId}
                      onChange={(e) => setIfoodClientId(e.target.value.trim())}
                      placeholder="Ex: a1b2c3d4-e5f6-7890-abcd-ef1234567890"
                      className="rounded-xl bg-background text-sm font-mono"
                    />
                    <span className="text-[10px] text-muted-foreground">
                      UUID de exatamente 36 caracteres gerado no Portal do Desenvolvedor
                    </span>
                  </div>

                  {/* Client Secret */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-semibold text-muted-foreground block">
                        Client Secret (Segredo)
                      </label>
                      {ifoodClientSecret.trim().length > 0 && (
                        <span className="text-[10px] font-mono text-muted-foreground">
                          {ifoodClientSecret.trim().length} caracteres
                        </span>
                      )}
                    </div>
                    <div className="relative">
                      <Input
                        type={showIfoodSecret ? "text" : "password"}
                        value={ifoodClientSecret}
                        onChange={(e) => setIfoodClientSecret(e.target.value.trim())}
                        placeholder="••••••••••••••••••••••••"
                        className="rounded-xl bg-background text-sm font-mono pr-10"
                      />
                      <button
                        type="button"
                        onClick={() => setShowIfoodSecret(!showIfoodSecret)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      >
                        {showIfoodSecret ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                      </button>
                    </div>
                    <span className="text-[10px] text-muted-foreground">
                      Chave secreta longa gerada junto com o app no Portal do Desenvolvedor
                    </span>
                  </div>
              </div>
            </div>

            {/* Parâmetros Operacionais de Automação */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Aceite Automático */}
              <div className="rounded-2xl glass-soft p-5 space-y-3 flex flex-col justify-between">
                <div>
                  <h4 className="font-display font-semibold text-sm">
                    Aceite Automático (Auto-accept)
                  </h4>
                  <p className="text-xs text-muted-foreground mt-1">
                    Aceita os pedidos do iFood instantaneamente, movendo direto para a coluna
                    &quot;Em Preparo&quot; e agilizando o despacho da cozinha.
                  </p>
                </div>
                <div className="flex items-center justify-between pt-2 border-t border-border/40">
                  <span className="text-xs font-medium">
                    Aceitar pedidos sem intervenção manual
                  </span>
                  <Switch checked={ifoodAutoAccept} onCheckedChange={setIfoodAutoAccept} />
                </div>
              </div>

              {/* Impressão Automática na Cozinha */}
              <div className="rounded-2xl glass-soft p-5 space-y-3 flex flex-col justify-between">
                <div>
                  <h4 className="font-display font-semibold text-sm">
                    Impressão Automática na Cozinha
                  </h4>
                  <p className="text-xs text-muted-foreground mt-1">
                    Dispara automaticamente o cupom térmico na impressora de produção da cozinha
                    assim que o pedido do iFood for aceito.
                  </p>
                </div>
                <div className="flex items-center justify-between pt-2 border-t border-border/40">
                  <span className="text-xs font-medium">Imprimir ticket térmico ao aceitar</span>
                  <Switch checked={ifoodAutoPrint} onCheckedChange={setIfoodAutoPrint} />
                </div>
              </div>

              {/* Alerta Sonoro de Novo Pedido */}
              <div className="rounded-2xl glass-soft p-5 space-y-3 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between">
                    <h4 className="font-display font-semibold text-sm">
                      Alerta Sonoro (Bip de Notificação)
                    </h4>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => playNewOrderSound()}
                      className="h-7 px-2 text-xs text-brand hover:text-brand gap-1"
                    >
                      <Volume2 className="size-3.5" />
                      Testar Som
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    Toca um aviso sonoro no computador quando novos pedidos entram na tela de
                    Delivery.
                  </p>
                </div>
                <div className="flex items-center justify-between pt-2 border-t border-border/40">
                  <span className="text-xs font-medium">Tocar bipe ao receber novos pedidos</span>
                  <Switch checked={ifoodSoundAlert} onCheckedChange={setIfoodSoundAlert} />
                </div>
              </div>

              {/* Tempo Médio de Preparo */}
              <div className="rounded-2xl glass-soft p-5 space-y-3 flex flex-col justify-between">
                <div>
                  <h4 className="font-display font-semibold text-sm">
                    Tempo Médio Estimado de Preparo
                  </h4>
                  <p className="text-xs text-muted-foreground mt-1">
                    Tempo informado ao iFood para exibição da estimativa aos clientes no aplicativo.
                  </p>
                </div>
                <div className="grid grid-cols-4 gap-2 pt-2 border-t border-border/40">
                  {[20, 30, 45, 60].map((min) => (
                    <button
                      key={min}
                      type="button"
                      onClick={() => setIfoodPrepTime(min)}
                      className={cn(
                        "py-2 rounded-xl text-xs font-semibold border transition-all text-center",
                        ifoodPrepTime === min
                          ? "border-brand bg-brand/10 text-brand ring-1 ring-brand"
                          : "border-border/60 hover:bg-muted/40 text-muted-foreground",
                      )}
                    >
                      {min} min
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Testes, Diagnóstico e Ações */}
            <div className="rounded-2xl glass-soft p-5 space-y-4">
              <div>
                <h4 className="font-display font-semibold text-sm">
                  Testes e Diagnóstico da Integração
                </h4>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Valide a conexão com a API do iFood e simule a chegada de um pedido de
                  demonstração para testar todo o fluxo do PDV.
                </p>
              </div>

              {/* Mensagem de Feedback */}
              {ifoodTestResult.message && (
                <div
                  className={cn(
                    "p-3 rounded-xl border text-xs flex items-center gap-2",
                    ifoodTestResult.status === "success"
                      ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-700 dark:text-emerald-300"
                      : "bg-destructive/10 border-destructive/30 text-destructive",
                  )}
                >
                  {ifoodTestResult.status === "success" ? (
                    <CheckCircle2 className="size-4 shrink-0 text-emerald-500" />
                  ) : (
                    <AlertCircle className="size-4 shrink-0 text-destructive" />
                  )}
                  <span>{ifoodTestResult.message}</span>
                </div>
              )}

              {/* Status do Polling em Background */}
              <div className="flex items-center justify-between p-3.5 rounded-xl bg-background/60 border border-border/60 text-xs">
                <div className="flex items-center gap-2">
                  <span
                    className={cn(
                      "size-2.5 rounded-full",
                      pos.ifoodPaused
                        ? "bg-wait animate-pulse"
                        : pos.ifoodPollingStatus === "connected"
                          ? "bg-free"
                          : pos.ifoodPollingStatus === "polling"
                            ? "bg-brand animate-spin"
                            : pos.ifoodPollingStatus === "error"
                              ? "bg-wait"
                              : "bg-muted-foreground",
                    )}
                  />
                  <div>
                    <p className="font-semibold text-foreground">
                      {pos.ifoodPaused
                        ? "Monitoramento Pausado"
                        : pos.ifoodPollingStatus === "connected"
                          ? "Monitoramento em Tempo Real Ativo"
                          : pos.ifoodPollingStatus === "polling"
                            ? "Consultando fila de eventos..."
                            : pos.ifoodPollingStatus === "error"
                              ? "Erro no monitoramento de eventos"
                              : "Aguardando inicialização..."}
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      {pos.ifoodLastPoll
                        ? `Última checagem: ${new Date(pos.ifoodLastPoll).toLocaleTimeString()} · ${pos.ifoodLastPollMessage || "OK"}`
                        : "Loop automático a cada 20 segundos enquanto o PDV estiver aberto"}
                    </p>
                  </div>
                </div>

                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  disabled={isPollingIfoodNow || isTestingIfood}
                  onClick={handlePollIfoodNow}
                  className="rounded-xl text-xs gap-1.5 h-8 font-semibold"
                >
                  <RefreshCw className={cn("size-3.5", isPollingIfoodNow && "animate-spin")} />
                  {isPollingIfoodNow ? "Consultando..." : "Consultar Fila Agora"}
                </Button>
              </div>

              <div className="flex flex-wrap items-center gap-3 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  disabled={isTestingIfood || isSimulatingIfood || isPollingIfoodNow}
                  onClick={handleTestIfood}
                  className="rounded-xl text-xs font-semibold gap-2"
                >
                  {isTestingIfood ? (
                    <RefreshCw className="size-3.5 animate-spin" />
                  ) : (
                    <ShoppingBag className="size-3.5" />
                  )}
                  {isTestingIfood ? "Autenticando..." : "Testar Conexão com API iFood"}
                </Button>

                <Button
                  type="button"
                  variant="outline"
                  disabled={isTestingIfood || isSimulatingIfood || isPollingIfoodNow}
                  onClick={handleSimulateIfoodOrder}
                  className="rounded-xl text-xs font-semibold gap-2 border-ifood/40 text-ifood hover:bg-ifood/10"
                >
                  {isSimulatingIfood ? (
                    <RefreshCw className="size-3.5 animate-spin" />
                  ) : (
                    <Sparkles className="size-3.5" />
                  )}
                  {isSimulatingIfood ? "Gerando Pedido..." : "Simular Pedido iFood de Teste"}
                </Button>

                <Button
                  type="button"
                  disabled={isSavingIfood}
                  onClick={handleSaveIfoodConfig}
                  className="rounded-xl bg-brand text-brand-foreground font-semibold text-xs gap-2 ml-auto"
                >
                  {isSavingIfood ? (
                    <RefreshCw className="size-3.5 animate-spin" />
                  ) : (
                    <Check className="size-3.5" />
                  )}
                  {isSavingIfood ? "Salvando..." : "Salvar Configurações do iFood"}
                </Button>
              </div>
            </div>

            {/* Dicas e Instruções do Portal do Desenvolvedor */}
            <div className="rounded-2xl border border-border/50 bg-secondary/30 p-5 space-y-2 text-xs text-muted-foreground">
              <h5 className="font-semibold text-foreground flex items-center gap-1.5">
                <Sliders className="size-3.5 text-brand" />
                Como obter as chaves no Portal do Desenvolvedor iFood:
              </h5>
              <ul className="list-disc pl-5 space-y-1.5">
                <li>
                  Acesse <strong>developer.ifood.com.br</strong> e faça login com a conta do Portal
                  do Parceiro do seu restaurante.
                </li>
                <li>
                  Em <strong>Minhas Aplicações</strong>, selecione ou crie sua aplicação de PDV
                  Desktop.
                </li>
                <li>
                  Copie o <strong>Client ID</strong> e gere o <strong>Client Secret</strong>.
                </li>
                <li>
                  No menu <strong>Lojas / Estabelecimentos</strong>, copie o identificador único{" "}
                  <strong>Merchant ID</strong>.
                </li>
              </ul>
            </div>
          </TabsContent>

          {/* =========================================================
              ABA 6: SISTEMA (STATUS & RESET DE FÁBRICA)
             ========================================================= */}
          <TabsContent value="sistema" className="flex-1 min-h-0 overflow-y-auto space-y-6 pr-2">
            {/* Resumo do Banco Local */}
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
              <div className="rounded-2xl glass-soft p-4">
                <p className="text-xs text-muted-foreground uppercase tracking-wider">
                  Mesas Ativas
                </p>
                <p className="text-2xl font-bold font-display mt-1">{tables.length}</p>
              </div>
              <div className="rounded-2xl glass-soft p-4">
                <p className="text-xs text-muted-foreground uppercase tracking-wider">Produtos</p>
                <p className="text-2xl font-bold font-display mt-1">{products.length}</p>
              </div>
              <div className="rounded-2xl glass-soft p-4">
                <p className="text-xs text-muted-foreground uppercase tracking-wider">
                  Entregadores
                </p>
                <p className="text-2xl font-bold font-display mt-1">{couriers.length}</p>
              </div>
              <div className="rounded-2xl glass-soft p-4">
                <p className="text-xs text-muted-foreground uppercase tracking-wider">
                  Vendas Registradas
                </p>
                <p className="text-2xl font-bold font-display mt-1">{pos.sales.length}</p>
              </div>
            </div>

            {/* Status do Sync Supabase */}
            <div className="rounded-2xl glass-soft p-5 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <h3 className="font-display font-semibold text-sm flex items-center gap-2">
                  <Database className="size-4 text-brand" />
                  Espelho em Nuvem (Supabase Sync Engine)
                </h3>
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={isTestingSupabase}
                    onClick={handleTestSupabase}
                    className="h-8 rounded-xl text-xs gap-1.5 font-semibold"
                  >
                    <RefreshCw className={cn("size-3.5", isTestingSupabase && "animate-spin")} />
                    Testar Conexão
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    disabled={isManualSyncing || !pos.online}
                    onClick={handleManualSync}
                    className="h-8 rounded-xl text-xs gap-1.5 font-semibold bg-brand hover:bg-brand/90 text-brand-foreground shadow-sm"
                  >
                    <RefreshCw className={cn("size-3.5", isManualSyncing && "animate-spin")} />
                    {isManualSyncing ? "Sincronizando..." : "Sincronizar Agora"}
                  </Button>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs pt-1">
                <div>
                  <span className="text-muted-foreground block mb-0.5">Configuração (.env):</span>
                  <span
                    className={cn(
                      "font-semibold",
                      isSupabaseConfigured() ? "text-free" : "text-wait",
                    )}
                  >
                    {isSupabaseConfigured() ? "Configurado" : "Não configurado"}
                  </span>
                </div>
                <div>
                  <span className="text-muted-foreground block mb-0.5">Status de Rede:</span>
                  <span className={cn("font-semibold", pos.online ? "text-free" : "text-wait")}>
                    {pos.online ? "Online (Conectado)" : "Offline (Local)"}
                  </span>
                </div>
                <div>
                  <span className="text-muted-foreground block mb-0.5">Fila de Pendências:</span>
                  <span
                    className={cn(
                      "font-semibold font-mono",
                      pendingSyncCount > 0 ? "text-amber-500" : "text-free",
                    )}
                  >
                    {pendingSyncCount} registro(s)
                  </span>
                </div>
                <div>
                  <span className="text-muted-foreground block mb-0.5">Última Sincronização:</span>
                  <span className="font-semibold">
                    {syncStatus.lastSyncAt
                      ? new Date(syncStatus.lastSyncAt).toLocaleTimeString()
                      : "Nenhuma ainda"}
                  </span>
                </div>
              </div>

              {syncStatus.lastError && (
                <div className="p-3 rounded-xl bg-destructive/10 border border-destructive/30 text-destructive text-xs flex items-start gap-2">
                  <AlertCircle className="size-4 shrink-0 mt-0.5" />
                  <span>
                    <strong>Último aviso de sync:</strong> {syncStatus.lastError}
                  </span>
                </div>
              )}
            </div>

            {/* Zona de Perigo - Reset de Fábrica */}
            <div className="rounded-2xl border border-destructive/40 bg-destructive/10 p-5 space-y-3">
              <div className="flex items-start gap-3">
                <AlertTriangle className="size-6 text-destructive shrink-0 mt-0.5" />
                <div>
                  <h4 className="font-bold text-destructive text-sm">
                    Zona de Perigo: Reset de Fábrica
                  </h4>
                  <p className="text-xs text-muted-foreground mt-1">
                    Esta ação apagará permanentemente todos os registros do banco de dados local
                    SQLite (vendas, comandas, mesas, produtos e movimentações de caixa). Esta
                    operação não pode ser desfeita.
                  </p>
                </div>
              </div>
              <Button
                type="button"
                variant="destructive"
                onClick={() => {
                  setResetConfirmText("");
                  setIsResetModalOpen(true);
                }}
                className="rounded-xl text-xs font-semibold"
              >
                Limpar Banco de Dados (Reset de Fábrica)
              </Button>
            </div>
          </TabsContent>
        </Tabs>
      </div>

      {/* MODAL: NOVA MESA */}
      <Dialog open={isNewTableOpen} onOpenChange={setIsNewTableOpen}>
        <DialogContent className="max-w-md bg-popover/95 backdrop-blur-2xl">
          <DialogHeader>
            <DialogTitle>Adicionar Mesa</DialogTitle>
            <DialogDescription>Informe o número da mesa e capacidade de lugares.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Número da Mesa</label>
              <Input
                type="number"
                value={newTableNumber}
                onChange={(e) => setNewTableNumber(e.target.value)}
                placeholder="Ex: 15"
                className="rounded-xl"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Lugares (Assentos)</label>
              <Input
                type="number"
                value={newTableSeats}
                onChange={(e) => setNewTableSeats(e.target.value)}
                placeholder="4"
                className="rounded-xl"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Garçom Padrão</label>
              <Input
                value={newTableWaiter}
                onChange={(e) => setNewTableWaiter(e.target.value)}
                placeholder="Ex: Equipe"
                className="rounded-xl"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="secondary"
              onClick={() => setIsNewTableOpen(false)}
              className="rounded-xl"
            >
              Cancelar
            </Button>
            <Button
              onClick={handleAddTable}
              className="rounded-xl bg-brand text-brand-foreground font-semibold"
            >
              Salvar Mesa
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* MODAL: MOTOBOY */}
      <Dialog open={isCourierModalOpen} onOpenChange={setIsCourierModalOpen}>
        <DialogContent className="max-w-md bg-popover/95 backdrop-blur-2xl">
          <DialogHeader>
            <DialogTitle>{courierEditingId ? "Editar Motoboy" : "Novo Motoboy"}</DialogTitle>
            <DialogDescription>
              Cadastre entregadores para despacho rápido no delivery.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Nome Completo</label>
              <Input
                value={courierName}
                onChange={(e) => setCourierName(e.target.value)}
                placeholder="Ex: Marcos Silva"
                className="rounded-xl"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground block mb-1">
                Telefone / WhatsApp
              </label>
              <Input
                value={courierPhone}
                onChange={(e) => setCourierPhone(e.target.value)}
                placeholder="(11) 98888-0000"
                className="rounded-xl"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="secondary"
              onClick={() => setIsCourierModalOpen(false)}
              className="rounded-xl"
            >
              Cancelar
            </Button>
            <Button
              onClick={handleSaveCourier}
              className="rounded-xl bg-brand text-brand-foreground font-semibold"
            >
              Salvar Entregador
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* MODAL: NOVA CATEGORIA */}
      <Dialog open={isCategoryModalOpen} onOpenChange={setIsCategoryModalOpen}>
        <DialogContent className="max-w-md bg-popover/95 backdrop-blur-2xl">
          <DialogHeader>
            <DialogTitle>Nova Categoria</DialogTitle>
            <DialogDescription>Crie uma categoria para agrupar produtos no PDV.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Nome da Categoria</label>
              <Input
                value={categoryName}
                onChange={(e) => setCategoryName(e.target.value)}
                placeholder="Ex: Porções, Massas, Bebidas"
                className="rounded-xl"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="secondary"
              onClick={() => setIsCategoryModalOpen(false)}
              className="rounded-xl"
            >
              Cancelar
            </Button>
            <Button
              onClick={handleAddCategory}
              className="rounded-xl bg-brand text-brand-foreground font-semibold"
            >
              Salvar Categoria
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* MODAL: PRODUTO */}
      <Dialog open={isProductModalOpen} onOpenChange={setIsProductModalOpen}>
        <DialogContent className="max-w-2xl bg-popover/95 backdrop-blur-2xl max-h-[88vh] flex flex-col p-6">
          <DialogHeader>
            <DialogTitle>{editingProductId ? "Editar Produto" : "Novo Produto"}</DialogTitle>
            <DialogDescription>
              Configure dados cadastrais, preço, categoria e opções de personalização.
            </DialogDescription>
          </DialogHeader>

          <Tabs
            value={productModalTab}
            onValueChange={(v) => setProductModalTab(v as "dados" | "opcoes")}
            className="flex-1 flex flex-col min-h-0 mt-2"
          >
            <TabsList className="grid grid-cols-2 mb-4 bg-secondary/80 rounded-xl h-10 p-1">
              <TabsTrigger value="dados" className="text-xs font-semibold rounded-lg">
                Dados Básicos
              </TabsTrigger>
              <TabsTrigger
                value="opcoes"
                className="text-xs font-semibold rounded-lg flex items-center justify-center gap-1.5"
              >
                <span>Opcionais & Modificadores</span>
                {allowCustomization && (
                  <span className="rounded-full bg-brand/20 text-brand text-[10px] font-bold px-1.5">
                    {addons.length}
                  </span>
                )}
              </TabsTrigger>
            </TabsList>

            <TabsContent value="dados" className="space-y-4 py-1 overflow-y-auto flex-1">
              <div className="grid grid-cols-[70px_1fr] gap-3">
                <div>
                  <label className="text-xs text-muted-foreground block mb-1">Emoji</label>
                  <Input
                    value={productEmoji}
                    onChange={(e) => setProductEmoji(e.target.value)}
                    className="rounded-xl text-center text-2xl h-11"
                    maxLength={2}
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground block mb-1">
                    Nome do Produto
                  </label>
                  <Input
                    value={productName}
                    onChange={(e) => setProductName(e.target.value)}
                    placeholder="Ex: X-Salada Especial"
                    className="rounded-xl h-11"
                  />
                </div>
              </div>
              <div>
                <label className="text-xs text-muted-foreground block mb-1">
                  Preço de Venda (R$)
                </label>
                <Input
                  value={productPrice}
                  onChange={(e) => setProductPrice(e.target.value)}
                  placeholder="Ex: 34.50"
                  className="rounded-xl h-11"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground block mb-1">Categoria</label>
                <Select
                  value={productCategory}
                  onValueChange={(newCat) => {
                    setProductCategory(newCat);
                    if (!editingProductId) {
                      loadCategorySuggestions(newCat);
                    }
                  }}
                >
                  <SelectTrigger className="h-11 w-full rounded-xl bg-background border border-input">
                    <SelectValue placeholder="Selecione uma categoria" />
                  </SelectTrigger>
                  <SelectContent>
                    {categoryEntities.map((c) => (
                      <SelectItem key={c.id} value={c.name}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </TabsContent>

            <TabsContent value="opcoes" className="space-y-4 py-1 overflow-y-auto flex-1 pr-1">
              <div className="flex items-center justify-between rounded-2xl glass-soft p-4">
                <div className="pr-4">
                  <p className="font-semibold text-sm">Permitir Personalização no PDV</p>
                  <p className="text-xs text-muted-foreground">
                    Se desativado, o produto será adicionado diretamente com 1 toque rápido (ideal
                    para bebidas e águas).
                  </p>
                </div>
                <Switch checked={allowCustomization} onCheckedChange={setAllowCustomization} />
              </div>

              {allowCustomization && (
                <>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">
                      Carregar padrões recomendados para {productCategory || "a categoria"}:
                    </span>
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={() => loadCategorySuggestions()}
                      className="rounded-xl text-xs flex items-center gap-1.5"
                    >
                      <Sparkles className="size-3.5 text-brand" />
                      Carregar sugestões
                    </Button>
                  </div>

                  {/* EXCLUSÕES */}
                  <div className="space-y-2">
                    <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block">
                      Ingredientes Removíveis (Exclusões)
                    </label>
                    <div className="flex flex-wrap gap-1.5 min-h-10 items-center rounded-xl glass-soft p-2.5">
                      {exclusions.length === 0 ? (
                        <span className="text-xs text-muted-foreground italic">
                          Nenhum ingrediente configurado para remoção.
                        </span>
                      ) : (
                        exclusions.map((ex, idx) => (
                          <span
                            key={idx}
                            className="inline-flex items-center gap-1.5 rounded-lg bg-surface px-2.5 py-1 text-xs font-medium border border-border"
                          >
                            {ex}
                            <button
                              type="button"
                              onClick={() =>
                                setExclusions((curr) => curr.filter((_, i) => i !== idx))
                              }
                              className="text-muted-foreground hover:text-wait"
                            >
                              <X className="size-3" />
                            </button>
                          </span>
                        ))
                      )}
                    </div>
                    <div className="flex gap-2">
                      <Input
                        value={newExclusionInput}
                        onChange={(e) => setNewExclusionInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && newExclusionInput.trim()) {
                            e.preventDefault();
                            setExclusions((curr) => [...curr, newExclusionInput.trim()]);
                            setNewExclusionInput("");
                          }
                        }}
                        placeholder="Ex: Sem cebola, Sem maionese"
                        className="rounded-xl h-9 text-xs"
                      />
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        onClick={() => {
                          if (newExclusionInput.trim()) {
                            setExclusions((curr) => [...curr, newExclusionInput.trim()]);
                            setNewExclusionInput("");
                          }
                        }}
                        className="rounded-xl text-xs shrink-0"
                      >
                        + Adicionar
                      </Button>
                    </div>
                  </div>

                  {/* ADICIONAIS PAGOS */}
                  <div className="space-y-2 pt-2 border-t border-border/40">
                    <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block">
                      Adicionais com Preço
                    </label>
                    <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
                      {addons.length === 0 ? (
                        <p className="text-xs text-muted-foreground italic py-2">
                          Nenhum adicional pago cadastrado para este produto.
                        </p>
                      ) : (
                        addons.map((add, idx) => (
                          <div
                            key={add.id || idx}
                            className="flex items-center justify-between rounded-xl glass-soft px-3 py-2 text-xs"
                          >
                            <span className="font-medium">{add.name}</span>
                            <div className="flex items-center gap-3">
                              <span className="num font-semibold text-cyan">
                                + {brl(add.price)}
                              </span>
                              <button
                                type="button"
                                onClick={() =>
                                  setAddons((curr) => curr.filter((_, i) => i !== idx))
                                }
                                className="text-muted-foreground hover:text-wait p-1"
                              >
                                <Trash2 className="size-3.5" />
                              </button>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                    <div className="grid grid-cols-[1fr_100px_auto] gap-2 pt-1">
                      <Input
                        value={newAddonName}
                        onChange={(e) => setNewAddonName(e.target.value)}
                        placeholder="Nome (ex: Bacon, Ovo)"
                        className="rounded-xl h-9 text-xs"
                      />
                      <Input
                        value={newAddonPrice}
                        onChange={(e) => setNewAddonPrice(e.target.value)}
                        placeholder="R$ (ex: 4.50)"
                        className="rounded-xl h-9 text-xs"
                      />
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        onClick={() => {
                          const p = parseFloat(newAddonPrice.replace(",", "."));
                          if (newAddonName.trim() && !isNaN(p) && p >= 0) {
                            setAddons((curr) => [
                              ...curr,
                              {
                                id: crypto.randomUUID(),
                                name: newAddonName.trim(),
                                price: p,
                                available: true,
                              },
                            ]);
                            setNewAddonName("");
                            setNewAddonPrice("");
                          } else {
                            toast.error("Informe nome e preço válido para o adicional.");
                          }
                        }}
                        className="rounded-xl text-xs shrink-0"
                      >
                        + Adicionar
                      </Button>
                    </div>
                  </div>

                  {/* DIVISÃO DE SABORES / PIZZA */}
                  <div className="space-y-3 pt-2 border-t border-border/40">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-semibold text-xs">
                          Fracionamento em Sabores (Meio a Meio)
                        </p>
                        <p className="text-[11px] text-muted-foreground">
                          Habilite para pizzas ou pratos que permitem escolher 2 metades.
                        </p>
                      </div>
                      <Switch checked={isPizza} onCheckedChange={setIsPizza} />
                    </div>

                    {isPizza && (
                      <div className="space-y-2 rounded-xl glass-soft p-3">
                        <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider block">
                          Sabores Disponíveis
                        </label>
                        <div className="space-y-1 max-h-32 overflow-y-auto">
                          {pizzaFlavors.map((flv, idx) => (
                            <div
                              key={idx}
                              className="flex items-center justify-between bg-surface rounded-lg px-2.5 py-1.5 text-xs"
                            >
                              <span>{flv.name}</span>
                              <div className="flex items-center gap-2">
                                <span className="num font-semibold text-cyan">
                                  {brl(flv.price)}
                                </span>
                                <button
                                  type="button"
                                  onClick={() =>
                                    setPizzaFlavors((curr) => curr.filter((_, i) => i !== idx))
                                  }
                                  className="text-muted-foreground hover:text-wait"
                                >
                                  <Trash2 className="size-3" />
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                        <div className="grid grid-cols-[1fr_90px_auto] gap-2 pt-1">
                          <Input
                            value={newFlavorName}
                            onChange={(e) => setNewFlavorName(e.target.value)}
                            placeholder="Sabor (ex: Calabresa)"
                            className="rounded-xl h-8 text-xs"
                          />
                          <Input
                            value={newFlavorPrice}
                            onChange={(e) => setNewFlavorPrice(e.target.value)}
                            placeholder="Preço (ex: 58)"
                            className="rounded-xl h-8 text-xs"
                          />
                          <Button
                            type="button"
                            size="sm"
                            variant="secondary"
                            onClick={() => {
                              const p = parseFloat(newFlavorPrice.replace(",", "."));
                              if (newFlavorName.trim() && !isNaN(p) && p >= 0) {
                                setPizzaFlavors((curr) => [
                                  ...curr,
                                  { name: newFlavorName.trim(), price: p },
                                ]);
                                setNewFlavorName("");
                                setNewFlavorPrice("");
                              }
                            }}
                            className="rounded-xl text-xs h-8"
                          >
                            + Sabor
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                </>
              )}
            </TabsContent>
          </Tabs>

          <DialogFooter className="mt-4 pt-3 border-t border-border">
            <Button
              variant="secondary"
              onClick={() => setIsProductModalOpen(false)}
              className="rounded-xl"
            >
              Cancelar
            </Button>
            <Button
              onClick={handleSaveProduct}
              className="rounded-xl bg-brand text-brand-foreground font-semibold"
            >
              Salvar Produto
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* MODAL: RESET DE FÁBRICA */}
      <Dialog open={isResetModalOpen} onOpenChange={setIsResetModalOpen}>
        <DialogContent className="max-w-md border-destructive/40 bg-popover/95 backdrop-blur-2xl">
          <DialogHeader>
            <DialogTitle className="text-destructive flex items-center gap-2">
              <AlertTriangle className="size-5" />
              Confirmação de Reset de Fábrica
            </DialogTitle>
            <DialogDescription>
              Esta ação apagará <strong>todos os dados do SQLite</strong>. Para confirmar, digite{" "}
              <strong>RESET</strong> no campo abaixo:
            </DialogDescription>
          </DialogHeader>
          <div className="py-2">
            <Input
              value={resetConfirmText}
              onChange={(e) => setResetConfirmText(e.target.value)}
              placeholder="Digite RESET"
              className="rounded-xl font-mono text-center uppercase tracking-widest border-destructive/50"
            />
          </div>
          <DialogFooter>
            <Button
              variant="secondary"
              onClick={() => setIsResetModalOpen(false)}
              className="rounded-xl"
              disabled={isResetting}
            >
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={handleFactoryReset}
              disabled={resetConfirmText.trim().toUpperCase() !== "RESET" || isResetting}
              className="rounded-xl font-semibold flex items-center gap-2"
            >
              {isResetting ? (
                <RefreshCw className="size-4 animate-spin" />
              ) : (
                <Trash2 className="size-4" />
              )}
              Confirmar e Zerar Banco
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ALERT DIALOG: CONFIRMAR EXCLUSÃO DE MESA */}
      <AlertDialog
        open={tableToDelete !== null}
        onOpenChange={(open) => !open && setTableToDelete(null)}
      >
        <AlertDialogContent className="bg-popover/95 backdrop-blur-2xl border-border">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Trash2 className="size-5 text-wait" />
              Remover Mesa {tableToDelete?.number}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja remover a <strong>Mesa {tableToDelete?.number}</strong>? Ela
              deixará de aparecer no mapa do salão. Apenas mesas vazias e sem atendimentos ativos
              podem ser removidas.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-xl">Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDeleteTable}
              className="rounded-xl bg-wait text-wait-foreground hover:bg-wait/90"
            >
              Sim, Remover Mesa
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ALERT DIALOG: CONFIRMAR EXCLUSÃO DE MOTOBOY */}
      <AlertDialog
        open={courierToDelete !== null}
        onOpenChange={(open) => !open && setCourierToDelete(null)}
      >
        <AlertDialogContent className="bg-popover/95 backdrop-blur-2xl border-border">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Bike className="size-5 text-wait" />
              Remover Entregador?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Deseja realmente remover o motoboy <strong>{courierToDelete?.name}</strong>? Ele não
              estará mais disponível para seleção no delivery.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-xl">Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDeleteCourier}
              className="rounded-xl bg-wait text-wait-foreground hover:bg-wait/90"
            >
              Sim, Remover Entregador
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ALERT DIALOG: CONFIRMAR EXCLUSÃO DE PRODUTO */}
      <AlertDialog
        open={productToDelete !== null}
        onOpenChange={(open) => !open && setProductToDelete(null)}
      >
        <AlertDialogContent className="bg-popover/95 backdrop-blur-2xl border-border">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Trash2 className="size-5 text-wait" />
              Remover Produto do Cardápio?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja remover o produto <strong>{productToDelete?.name}</strong> do
              cardápio? Ele não poderá mais ser vendido ou selecionado em novos pedidos.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-xl">Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDeleteProduct}
              className="rounded-xl bg-wait text-wait-foreground hover:bg-wait/90"
            >
              Sim, Remover Produto
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppShell>
  );
}
