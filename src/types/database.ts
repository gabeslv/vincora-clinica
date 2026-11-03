export type AppointmentStatus =
  | "scheduled"
  | "confirmed"
  | "completed"
  | "cancelled"
  | "no_show";

export type Patient = {
  id: string;
  owner_id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  birth_date: string | null;
  administrative_notes: string | null;
  status: "active" | "inactive";
  created_at: string;
  updated_at: string;
};

export type Appointment = {
  id: string;
  owner_id: string;
  patient_id: string;
  starts_at: string;
  duration_minutes: number;
  modality: "in_person" | "video" | "phone";
  status: AppointmentStatus;
  administrative_note: string | null;
  created_at: string;
};

export type ClinicalRecord = {
  id: string;
  owner_id: string;
  patient_id: string;
  appointment_id: string | null;
  record_type: "anamnesis" | "evolution" | "care_plan" | "other";
  title: string;
  content: string;
  occurred_at: string;
  is_finalized: boolean;
  finalized_at: string | null;
  amends_record_id: string | null;
  amendment_reason: string | null;
  created_at: string;
  updated_at: string;
};

export type FinancialTransaction = {
  id: string;
  owner_id: string;
  patient_id: string | null;
  appointment_id: string | null;
  transaction_type: "income" | "expense";
  description: string;
  amount_cents: number;
  status: "pending" | "paid" | "cancelled";
  due_date: string | null;
  paid_at: string | null;
  created_at: string;
  updated_at: string;
};

export type ClinicSetting = {
  owner_id: string;
  clinic_name: string;
  timezone: string;
  default_session_minutes: number;
  business_hours: Record<string, { enabled: boolean; start: string; end: string }>;
  created_at: string;
  updated_at: string;
};

export type DocumentRecord = {
  id: string;
  owner_id: string;
  patient_id: string | null;
  template_id: string | null;
  document_type: string;
  title: string;
  content: string | null;
  storage_path: string | null;
  status: "draft" | "issued" | "archived";
  created_at: string;
  updated_at: string;
};
