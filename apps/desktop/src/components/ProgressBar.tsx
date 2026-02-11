import { useSmoothProgress } from '../hooks/useSmoothProgress';
import './ProgressBar.css';

interface ProgressStep {
  id: string;
  label: string;
  status: 'pending' | 'active' | 'complete';
}

interface ProgressBarProps {
  title: string;
  percentage: number;
  status: string;
  steps?: ProgressStep[];
  isComplete?: boolean;
  hasError?: boolean;
  animate?: boolean;
}

export function ProgressBar({ 
  title, 
  percentage, 
  status, 
  steps,
  isComplete,
  hasError,
  animate = true
}: ProgressBarProps) {
  // Use smooth progress animation
  const smoothPercentage = useSmoothProgress(percentage, {
    duration: animate ? 600 : 0,
    easing: 'easeOut'
  });
  
  const fillClass = hasError ? 'error' : isComplete ? 'complete' : '';
  
  return (
    <div className="progress-container">
      <div className="progress-header">
        <span className="progress-title">{title}</span>
        <span className="progress-percentage">{Math.round(smoothPercentage)}%</span>
      </div>
      
      <div className="progress-bar-bg">
        {/* Track glow effect */}
        <div className="progress-bar-glow" style={{ opacity: smoothPercentage > 0 ? 1 : 0 }} />
        
        {/* Main fill bar */}
        <div 
          className={`progress-bar-fill ${fillClass}`}
          style={{ width: `${Math.min(smoothPercentage, 100)}%` }}
        >
          {/* Shimmer effect */}
          <div className="progress-bar-shimmer" />
          
          {/* Pulse effect when active */}
          {!isComplete && !hasError && smoothPercentage > 0 && (
            <div className="progress-bar-pulse" />
          )}
        </div>
      </div>
      
      <div className="progress-status">
        {status && <span className="status-dot" />}
        {status}
      </div>
      
      {steps && steps.length > 0 && (
        <div className="progress-steps">
          {steps.map((step, index) => (
            <div 
              key={step.id}
              className={`progress-step ${step.status}`}
              style={{ animationDelay: `${index * 100}ms` }}
            >
              <div className="step-indicator">
                {step.status === 'complete' && (
                  <svg className="step-check" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                )}
                {step.status === 'active' && <div className="step-pulse" />}
                {step.status === 'pending' && <div className="step-dot" />}
              </div>
              <span className="step-label">{step.label}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
