/**
 * Único punto de acceso a datos de la app.
 *
 * Reglas (CLAUDE.md):
 * - Las pantallas no hacen consultas sueltas: importan desde aquí.
 * - Todas las funciones reciben un DataContext validado en el servidor y
 *   filtran por `owner` (Balance) y rol, aunque RLS sea todavía laxa.
 * - Solo `flow = 'normal'` cuenta en ingresos y gastos.
 * - Supermercado: `supermarket_purchases`, agrupado por `catId`.
 */
import "server-only";

export {
  getSession,
  getDataContext,
  assertOwner,
  type Session,
  type DataContext,
} from "./session";

export { getSummary, type Summary, type ConceptSpendRow } from "./summary";
export {
  listConcepts,
  createConcept,
  type ConceptOption,
  type ConceptSection,
} from "./concepts";
export { listAccounts, createAccount, type Account, type AccountType } from "./accounts";
export {
  listTransactions,
  countWithoutConcept,
  nextWithoutConcept,
  setTransactionConcept,
  setTransactionFlow,
  findSimilar,
  applyConceptToMany,
  conceptHistory,
  type Flow,
  type Transaction,
  type TxFilters,
  type TxType,
} from "./transactions";
export { getTemplate, saveTemplate, existingImportKeys, insertTransactions } from "./imports";
export { getBalance, type BalanceData } from "./balance";
export {
  setManualAmount,
  setCellComment,
  createBalanceConcept,
  updateBalanceConcept,
  moveBalanceConcept,
  reorderBalanceConcept,
  setConceptArchived,
  previewDeleteConcept,
  setConceptNote,
  manualConflicts,
  deleteBalanceConcept,
  type DeletePreview,
  setConceptHidden,
  type NewConceptInput,
} from "./balance-edit";
export { getSupermarket, type SupermarketData } from "./supermarket";
export {
  createPurchase,
  updatePurchase,
  deletePurchase,
  listStores,
  type PurchaseInput,
  type PaidBy,
} from "./supermarket-edit";
export {
  getAmex,
  getQuickAddData,
  listManualPayments,
  listPagosConcepts,
  type AmexData,
  type ManualRow,
  type QuickAddData,
} from "./pagos";
export { savePayment, deletePayment, markTransferred, createPaymentMethod, type PaymentInput } from "./pagos-edit";
export { getBudget, setBudgets, type BudgetData } from "./budget";
export { getFlow, saveFlow, type FlowData } from "./flow";
