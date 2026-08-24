export const APP_NAME = 'ATLAS SCU';
export const APP_VERSION = '0.1.0';

// Compilare solo dopo la distribuzione della Web App Google Apps Script.
// L'URL /exec non contiene credenziali; le credenziali restano nel backend.
export const APPS_SCRIPT_URL = '';

export const SESSION_KEY = 'atlas-scu-session-v1';

export const SCU_DEFAULTS = Object.freeze({
  annualHours: 1145,
  weeklyDays: 5,
  weeklyAverageHours: 25,
  minDailyHours: 3,
  maxDailyHours: 8,
  serviceStartMin: '06:00',
  serviceEndMax: '23:00',
  minWeeklyOlpHours: 10,
  ordinaryPermitDaysDefault: 20,
  limitedExtraordinaryPermitDaysMax: 15,
  compensatoryRestDaysMaxPerMonth: 1,
  generalTrainingHours: 30,
  generalTrainingDeadlineDays: 30,
  specificTrainingHoursMin: 72,
  specificTrainingDeadlineDays: 60,
  tutoringHours: 21
});
