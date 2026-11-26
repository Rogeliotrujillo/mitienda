export type ScreenId =
  | "home"
  | "stock"
  | "metrics"
  | "reports"
  | "voice-sale"
  | "voice-entry";

export type TrafficLightStatus = "red" | "yellow" | "green";

export interface AuthUser {
  id: string;
  username: string;
  displayName: string;
  storeName: string;
}

export interface Product {
  id: string;
  name: string;
  unit: string;
  quantity: number;
  minStock: number;
  pricePerUnit: number;
}

export interface Movement {
  id: string;
  type: "sale" | "entry";
  productId: string;
  productName: string;
  quantity: number;
  unit: string;
  amountBalboas: number;
  timestamp: string;
  source: "manual" | "voice";
}

export interface VoiceParsedItem {
  tempId: string;
  matchedProductId: string;
  productName: string;
  quantity: number;
  unit: string;
  amountBalboas: number;
}

export function getStockStatus(product: Product): TrafficLightStatus {
  if (product.quantity <= 0) {
    return "red";
  }
  if (product.quantity <= product.minStock) {
    return "yellow";
  }
  return "green";
}

export function formatBalboas(amount: number): string {
  return `B/. ${amount.toFixed(2)}`;
}

export function formatQuantity(qty: number): string {
  if (Number.isInteger(qty)) {
    return String(qty);
  }
  return qty.toFixed(1).replace(/\.0$/, "");
}
