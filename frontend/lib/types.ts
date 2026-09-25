export type OrderStatus =
  | "quote_pending"
  | "quoted"
  | "paid"
  | "printing"
  | "post_processing"
  | "qc"
  | "shipped"
  | "failed"
  | "reprint";

export type MachineStatus = "idle" | "printing" | "maintenance";
export type Technology = "SLA" | "SLS";

export type Material =
  | "resin_standard"
  | "resin_tough"
  | "resin_castable"
  | "nylon_pa12"
  | "nylon_glass_filled";

export interface Machine {
  id: number;
  name: string;
  technology: Technology;
  status: MachineStatus;
  is_available: boolean;
}

export interface Part {
  id: number;
  name: string;
  material: Material;
  quantity: number;
  length_mm: string;
  width_mm: string;
  height_mm: string;
}

export interface Order {
  id: number;
  part: number;
  part_detail: Part | null;
  customer: number | null;
  customer_username: string | null;
  status: OrderStatus;
  quoted_price: string | null;
  quoted_lead_days: number | null;
  machine: number | null;
  machine_detail: Machine | null;

  allowed_transitions: OrderStatus[];
  created_at: string;
  updated_at: string;
}

export interface AuditEntry {
  id: number;
  order: number;
  actor: number | null;
  actor_username: string | null;

  from_status: OrderStatus | "";
  to_status: OrderStatus;
  timestamp: string;
  note: string;
}

export interface Me {
  id: number;
  username: string;
  email: string;
  role: "customer" | "operator" | null;
}

export interface Paginated<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}

export interface StageCount {
  status: OrderStatus;
  label: string;
  count: number;
}

export interface PublicStats {
  orders: {
    total: number;
    active: number;
    shipped: number;
    by_status: Record<OrderStatus, number>;
  };
  pipeline: StageCount[];
  exceptions: StageCount[];
  machines: {
    total: number;
    busy: number;
    idle: number;
    maintenance: number;
    by_status: Record<MachineStatus, number>;
  };
  transitions_recorded: number;
}

export interface Quote {
  price: number;
  lead_time_days: number;
  currency: "USD";
  breakdown: {
    volume_cm3: number;
    rate_per_cm3: number;
    material_cost: number;
    setup_fee: number;
    rush_applied: boolean;
    rush_multiplier: number;
    machine_load_factor: number;
  };
}

export interface ActionResult {
  ok: boolean;
  error?: string;
}

export interface QuoteResult {
  ok: boolean;
  error?: string;
  quote?: Quote;
}
