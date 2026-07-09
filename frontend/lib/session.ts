"use client";

import { Doctor } from "./api";

/**
 * Demo session only: the "logged in" doctor is a plain object in
 * localStorage, readable/writable by anyone with devtools. It exists to
 * drive the uchastok-scoped UI (a doctor sees only their own panel), not to
 * secure anything -- the backend does not verify this token on any request.
 * Replace with real server-issued sessions before this touches real data.
 */
const KEY = "lp-doctor-session";

export function getSession(): Doctor | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem(KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Doctor;
  } catch {
    return null;
  }
}

export function setSession(doctor: Doctor) {
  localStorage.setItem(KEY, JSON.stringify(doctor));
}

export function clearSession() {
  localStorage.removeItem(KEY);
}
