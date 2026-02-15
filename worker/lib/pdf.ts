// PDF generation utilities
// The actual PDF generation is done in the export route using HTML
// This file provides helper types and utilities

export interface PdfOptions {
  babyName: string;
  from: string;
  to: string;
  sections: string[];
}

export function formatDateChinese(dateStr: string): string {
  const d = new Date(dateStr);
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
}

export function calculateAgeDays(birthDate: string, targetDate: string): number {
  const birth = new Date(birthDate);
  const target = new Date(targetDate);
  return Math.floor((target.getTime() - birth.getTime()) / 86400000);
}

export function calculateAge(birthDate: string, targetDate?: string): string {
  const birth = new Date(birthDate);
  const target = targetDate ? new Date(targetDate) : new Date();
  const days = Math.floor((target.getTime() - birth.getTime()) / 86400000);

  if (days < 30) return `${days} 天`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months} 個月`;
  const years = Math.floor(months / 12);
  const remMonths = months % 12;
  return remMonths > 0 ? `${years} 歲 ${remMonths} 個月` : `${years} 歲`;
}
