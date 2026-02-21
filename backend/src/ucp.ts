import Ajv from 'ajv';
import { createHash } from 'crypto';

const ajv = new Ajv({ allErrors: true });

// Inline schemas to avoid filesystem issues in deploy
const commonFields = {
  message_id: { type: 'string' },
  message_type: { type: 'string' },
  job_id: { type: 'string' },
  buyer_agent_id: { type: 'string' },
  seller_agent_id: { type: 'string' },
  price: { type: 'number', minimum: 0 },
  currency: { type: 'string' },
  timestamp: { type: 'string' },
  canonical_hash: { type: 'string' },
  signature: { type: 'string' },
};

const quoteSchema = {
  type: 'object',
  properties: {
    ...commonFields,
    message_type: { type: 'string', const: 'Quote' },
    expiry: { type: 'string' },
    skills: { type: 'array', items: { type: 'string' } },
    estimated_duration_ms: { type: 'number' },
  },
  required: ['message_type', 'message_id', 'job_id', 'buyer_agent_id', 'seller_agent_id', 'price', 'currency', 'timestamp'],
};

const invoiceSchema = {
  type: 'object',
  properties: {
    ...commonFields,
    message_type: { type: 'string', const: 'Invoice' },
    due_date: { type: 'string' },
    line_items: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          description: { type: 'string' },
          amount: { type: 'number' },
        },
        required: ['description', 'amount'],
      },
    },
    status: { type: 'string', enum: ['pending', 'paid', 'overdue'] },
  },
  required: ['message_type', 'message_id', 'job_id', 'buyer_agent_id', 'seller_agent_id', 'price', 'currency', 'timestamp'],
};

const receiptSchema = {
  type: 'object',
  properties: {
    ...commonFields,
    message_type: { type: 'string', const: 'Receipt' },
    invoice_id: { type: 'string' },
    payment_tx_id: { type: 'string' },
    payment_timestamp: { type: 'string' },
    hcs_sequence_number: { type: 'number' },
  },
  required: ['message_type', 'message_id', 'job_id', 'buyer_agent_id', 'seller_agent_id', 'price', 'currency', 'timestamp'],
};

const validateQuote = ajv.compile(quoteSchema);
const validateInvoice = ajv.compile(invoiceSchema);
const validateReceipt = ajv.compile(receiptSchema);

export function isValidQuote(data: any): { valid: boolean; errors?: any } {
  const valid = validateQuote(data);
  return { valid: !!valid, errors: validateQuote.errors };
}

export function isValidInvoice(data: any): { valid: boolean; errors?: any } {
  const valid = validateInvoice(data);
  return { valid: !!valid, errors: validateInvoice.errors };
}

export function isValidReceipt(data: any): { valid: boolean; errors?: any } {
  const valid = validateReceipt(data);
  return { valid: !!valid, errors: validateReceipt.errors };
}

export function canonicalHash(obj: Record<string, any>): string {
  const { canonical_hash, signature, ...rest } = obj;
  const sorted = JSON.stringify(rest, Object.keys(rest).sort());
  return createHash('sha256').update(sorted).digest('hex');
}

export function buildQuote(params: {
  job_id: string;
  buyer_agent_id: string;
  seller_agent_id: string;
  price: number;
  currency: string;
  skills: string[];
  estimated_duration_ms: number;
}) {
  const quote: any = {
    message_type: 'Quote',
    message_id: `quote-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    ...params,
    expiry: new Date(Date.now() + 300000).toISOString(),
    timestamp: new Date().toISOString(),
    signature: 'placeholder',
  };
  quote.canonical_hash = canonicalHash(quote);
  return quote;
}

export function buildInvoice(params: {
  job_id: string;
  buyer_agent_id: string;
  seller_agent_id: string;
  price: number;
  currency: string;
  description: string;
}) {
  const invoice: any = {
    message_type: 'Invoice',
    message_id: `inv-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    ...params,
    due_date: new Date(Date.now() + 3600000).toISOString(),
    line_items: [{ description: params.description, amount: params.price }],
    status: 'pending',
    timestamp: new Date().toISOString(),
    signature: 'placeholder',
  };
  invoice.canonical_hash = canonicalHash(invoice);
  return invoice;
}

export function buildReceipt(params: {
  job_id: string;
  buyer_agent_id: string;
  seller_agent_id: string;
  price: number;
  currency: string;
  invoice_id: string;
  payment_tx_id: string;
  hcs_sequence_number: number;
}) {
  const receipt: any = {
    message_type: 'Receipt',
    message_id: `rcpt-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    ...params,
    payment_timestamp: new Date().toISOString(),
    timestamp: new Date().toISOString(),
    signature: 'placeholder',
  };
  receipt.canonical_hash = canonicalHash(receipt);
  return receipt;
}
