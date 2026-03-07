/**
 * Extrai dados do payload webhook da Cakto
 * Payload padrão: { event: "purchase_approved", data: { customer: { name, phone, email, docNumber } } }
 */

export interface CaktoCustomer {
  name: string;
  phone: string;
  email: string;
  cpf: string; // docNumber
}

/** Extrai dados do cliente do payload Cakto */
export function extractCaktoCustomer(payload: Record<string, unknown>): CaktoCustomer {
  const data = (payload.data || {}) as Record<string, unknown>;
  const customer = (data.customer || data.buyer || {}) as Record<string, unknown>;
  return {
    name: (customer.name as string) || 'Cliente',
    phone: (customer.phone as string) || '',
    email: (customer.email as string) || '',
    cpf: (customer.docNumber as string) || '',
  };
}

/** Extrai o tipo de evento do payload Cakto */
export function extractCaktoEvent(payload: Record<string, unknown>): string {
  return ((payload.event as string) || '').toLowerCase();
}

/** Extrai primeiro nome e capitaliza */
export function firstName(fullName: string): string {
  const primeiro = fullName.split(' ')[0];
  return primeiro.charAt(0).toUpperCase() + primeiro.slice(1).toLowerCase();
}
