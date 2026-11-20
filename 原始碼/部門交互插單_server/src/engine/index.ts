/* 固定程式計算引擎：直接載入 v1 的 engine.cjs（一字不改），這裡只補型別。
   原則：相同輸入必得相同結果；引擎內不呼叫模型。 */
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

export type FieldKey = 'customer' | 'model' | 'qty' | 'due' | 'partChange' | 'isAdd';
export type Field = { value: any; conf: number; span: [number, number] | null; note: string; src: string; alts?: { value: any; label: string }[] };
export type Fields = Record<FieldKey, Field>;
export type AsOf = { date: string; hour: number };
export type Params = { data: any; guess: any; prices: Record<string, number>; clock: any; conf: { threshold: number } };
export type QueueItem = { id: string; customer: string; model: string; qty: number; due: string; running?: boolean; [k: string]: any };
export type CalcInput = { id: string; customer: string; model: string; qty: number; due: string; partChange: boolean };

export interface Engine {
  defaults(): Params;
  seedQueue(): QueueItem[];
  calc(queue: QueueItem[], X: CalcInput, P: Params, asOf: AsOf): any;
  risk(c: any, cal: any, P: Params): { label: string; [k: string]: any };
  lossLevel(d: number, P: Params): { label: string; [k: string]: any };
  ruleParse(text: string, ctx: { P: Params; today: string }): Fields;
  validateModelOutput(text: string, obj: unknown, ctx: { P: Params; today: string }): { fields: Fields | null; issues: string[] };
  mergeParse(rule: Fields, llm: Fields | null): Fields;
  replyDraft(order: { fields: Fields }, dueDate: string, requested: string): string;
  weightOf(customer: string, P: Params): number;
  FIELD_ORDER: FieldKey[];
  FIELD_LABEL: Record<FieldKey, string>;
  TABLES: { customers: Record<string, string[]>; models: string[] };
  util: { mdw(d: string): string; fnv(s: string): string; addDays(d: string, n: number): string; [k: string]: any };
}

export const E: Engine = require('./engine.cjs');
