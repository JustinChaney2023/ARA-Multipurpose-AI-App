import { useState, useEffect, useRef } from 'react';

interface UseSmoothProgressOptions {
  duration?: number; // Total duration in ms for 0-100%
  easing?: 'linear' | 'easeOut' | 'easeInOut';
}

export function useSmoothProgress(targetValue: number, options: UseSmoothProgressOptions = {}) {
  const { duration = 500, easing = 'easeOut' } = options;
  const [displayValue, setDisplayValue] = useState(0);
  const animationRef = useRef<number | null>(null);
  const startTimeRef = useRef<number | null>(null);
  const startValueRef = useRef(0);

  useEffect(() => {
    // Cancel any existing animation
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
    }

    const startValue = displayValue;
    const endValue = Math.min(Math.max(targetValue, 0), 100);
    const change = endValue - startValue;
    
    // If no change needed, skip animation
    if (change === 0) return;

    startValueRef.current = startValue;
    startTimeRef.current = null;

    const animate = (timestamp: number) => {
      if (!startTimeRef.current) {
        startTimeRef.current = timestamp;
      }

      const elapsed = timestamp - startTimeRef.current;
      const progress = Math.min(elapsed / duration, 1);

      // Apply easing
      let easedProgress: number;
      switch (easing) {
        case 'linear':
          easedProgress = progress;
          break;
        case 'easeOut':
          easedProgress = 1 - Math.pow(1 - progress, 3);
          break;
        case 'easeInOut':
          easedProgress = progress < 0.5 
            ? 4 * progress * progress * progress 
            : 1 - Math.pow(-2 * progress + 2, 3) / 2;
          break;
        default:
          easedProgress = progress;
      }

      const currentValue = startValueRef.current + (change * easedProgress);
      setDisplayValue(currentValue);

      if (progress < 1) {
        animationRef.current = requestAnimationFrame(animate);
      }
    };

    animationRef.current = requestAnimationFrame(animate);

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [targetValue, duration, easing]);

  return displayValue;
}
