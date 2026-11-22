// The company a recruiter is working in. Recruiters only see their own
// company's tests and question bank; one who belongs to several picks which
// one from the sidebar, and the choice is remembered per browser. Admins are
// not scoped, so for them companyId is always ''.

import { useEffect, useState } from 'react';
import { listCompanies, type Company } from './api';
import { isRecruiter } from './auth';

const KEY = 'admin_company';

let companies: Company[] = [];
let selected = '';
let loaded = false;
let failed = false;
let loading: Promise<void> | null = null;
const listeners = new Set<() => void>();

function readSaved(): string {
  try {
    return localStorage.getItem(KEY) || '';
  } catch {
    return '';
  }
}

function emit() {
  listeners.forEach((l) => l());
}

async function load(): Promise<void> {
  if (loaded || !isRecruiter()) return;
  if (!loading) {
    loading = listCompanies()
      .then((res) => {
        failed = false;
        companies = res.companies || [];
        const saved = readSaved();
        selected = companies.some((c) => c.id === saved) ? saved : companies[0]?.id || '';
      })
      .catch(() => {
        failed = true;
        companies = [];
        selected = '';
      })
      .finally(() => {
        loaded = true;
        loading = null;
        emit();
      });
  }
  return loading;
}

export function setCompany(id: string) {
  selected = id;
  try {
    localStorage.setItem(KEY, id);
  } catch {
    /* not remembered — fine */
  }
  emit();
}

/** Current company id for a recruiter, '' for an admin. */
export function currentCompanyId(): string {
  return isRecruiter() ? selected : '';
}

/** Forget the loaded companies, e.g. on sign-out. */
export function resetCompany() {
  companies = [];
  selected = '';
  loaded = false;
  failed = false;
}

/** Try loading a recruiter's companies again after a failure. */
export function retryCompany() {
  loaded = false;
  load();
}

export function useCompany() {
  const [, force] = useState(0);
  useEffect(() => {
    const l = () => force((n) => n + 1);
    listeners.add(l);
    load();
    return () => {
      listeners.delete(l);
    };
  }, []);
  const recruiter = isRecruiter();
  return {
    recruiter,
    companies,
    companyId: recruiter ? selected : '',
    company: companies.find((c) => c.id === selected),
    /** False until a recruiter's companies have been fetched. Always true for admins. */
    ready: !recruiter || loaded,
    /** The companies request failed, as opposed to returning none. */
    failed: recruiter && failed,
  };
}

/** Appends companyId=… to a query string when a recruiter is scoped to one. */
export function withCompany(params = ''): string {
  const id = currentCompanyId();
  if (!id) return params;
  const q = `companyId=${encodeURIComponent(id)}`;
  return params ? `${params}&${q}` : q;
}
