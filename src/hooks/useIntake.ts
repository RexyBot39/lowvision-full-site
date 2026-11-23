import { useState, useEffect, useCallback } from 'react';
import type { IntakeAnswers } from '../lib/intake/types';
import { PLAN_STORAGE_KEY as STORAGE_KEY, PLAN_SYNC_EVENT, schedulePlanPush } from '../lib/planSync';

interface StoredIntake {
  answers: IntakeAnswers;
  currentStep: number;
  savedAt: string;
  isComplete: boolean;
}

const defaultAnswers: IntakeAnswers = { mode: 'patient' };

export function useIntake() {
  const [answers, setAnswers] = useState<IntakeAnswers>(defaultAnswers);
  const [currentStep, setCurrentStep] = useState(0);
  const [isComplete, setIsComplete] = useState(false);
  const [savedMessage, setSavedMessage] = useState('');

  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    function loadFromStorage() {
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) {
          const stored: StoredIntake = JSON.parse(raw);
          setAnswers(stored.answers);
          setCurrentStep(stored.currentStep);
          setIsComplete(stored.isComplete);
        } else {
          setAnswers(defaultAnswers);
          setCurrentStep(0);
          setIsComplete(false);
        }
      } catch {
        /* ignore */
      }
      setLoaded(true);
    }
    loadFromStorage();
    // Reload when the account's plan is pulled down after sign-in / cleared on sign-out.
    window.addEventListener(PLAN_SYNC_EVENT, loadFromStorage);
    return () => window.removeEventListener(PLAN_SYNC_EVENT, loadFromStorage);
  }, []);

  useEffect(() => {
    // Don't overwrite the saved plan with defaults before it has been read.
    if (!loaded) return;
    try {
      const stored: StoredIntake = {
        answers,
        currentStep,
        savedAt: new Date().toISOString(),
        isComplete,
      };
      const next = JSON.stringify(stored);
      const prev = localStorage.getItem(STORAGE_KEY);
      // Don't create a saved plan out of untouched defaults.
      const untouched =
        !isComplete && currentStep === 0 && JSON.stringify(answers) === JSON.stringify(defaultAnswers);
      if (!prev && untouched) return;
      // Only write (and sync) when something besides the timestamp changed.
      if (prev && JSON.stringify({ ...JSON.parse(prev), savedAt: '' }) === JSON.stringify({ ...stored, savedAt: '' })) {
        return;
      }
      localStorage.setItem(STORAGE_KEY, next);
      schedulePlanPush();
    } catch {
      /* ignore */
    }
  }, [loaded, answers, currentStep, isComplete]);

  const updateAnswers = useCallback((partial: Partial<IntakeAnswers>) => {
    setAnswers((prev) => ({ ...prev, ...partial }));
  }, []);

  const goToStep = useCallback((n: number) => setCurrentStep(n), []);

  const nextStep = useCallback((totalSteps: number) => {
    setCurrentStep((s) => Math.min(s + 1, totalSteps - 1));
  }, []);

  const prevStep = useCallback(() => {
    setCurrentStep((s) => Math.max(s - 1, 0));
  }, []);

  const markComplete = useCallback(() => setIsComplete(true), []);

  const clearIntake = useCallback(() => {
    setAnswers(defaultAnswers);
    setCurrentStep(0);
    setIsComplete(false);
    localStorage.removeItem(STORAGE_KEY);
    schedulePlanPush();
  }, []);

  const saveAndShowMessage = useCallback(() => {
    setSavedMessage('Progress saved. You can return any time to continue.');
    setTimeout(() => setSavedMessage(''), 4000);
  }, []);

  const hasSavedData = useCallback((): boolean => {
    try {
      return !!localStorage.getItem(STORAGE_KEY);
    } catch {
      return false;
    }
  }, []);

  const getSavedAt = useCallback((): string | null => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const stored: StoredIntake = JSON.parse(raw);
        return stored.savedAt;
      }
    } catch {
      /* ignore */
    }
    return null;
  }, []);

  return {
    answers,
    currentStep,
    isComplete,
    savedMessage,
    updateAnswers,
    goToStep,
    nextStep,
    prevStep,
    markComplete,
    clearIntake,
    saveAndShowMessage,
    hasSavedData,
    getSavedAt,
  };
}
