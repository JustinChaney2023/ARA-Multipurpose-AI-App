import { useState, useCallback, useRef } from 'react';

interface UndoRedoState<T> {
  past: T[];
  present: T;
  future: T[];
}

export function useUndoRedo<T>(initialState: T, maxHistory = 50) {
  const [state, setState] = useState<UndoRedoState<T>>({
    past: [],
    present: initialState,
    future: [],
  });
  
  const stateRef = useRef(state);
  stateRef.current = state;
  
  const canUndo = state.past.length > 0;
  const canRedo = state.future.length > 0;
  
  const set = useCallback((newState: T | ((prev: T) => T)) => {
    const resolvedState = typeof newState === 'function' 
      ? (newState as (prev: T) => T)(stateRef.current.present)
      : newState;
    
    setState(prev => {
      const newPast = [...prev.past, prev.present];
      if (newPast.length > maxHistory) {
        newPast.shift();
      }
      return {
        past: newPast,
        present: resolvedState,
        future: [],
      };
    });
  }, [maxHistory]);
  
  const undo = useCallback(() => {
    setState(prev => {
      if (prev.past.length === 0) return prev;
      
      const previous = prev.past[prev.past.length - 1];
      const newPast = prev.past.slice(0, -1);
      
      return {
        past: newPast,
        present: previous,
        future: [prev.present, ...prev.future],
      };
    });
  }, []);
  
  const redo = useCallback(() => {
    setState(prev => {
      if (prev.future.length === 0) return prev;
      
      const next = prev.future[0];
      const newFuture = prev.future.slice(1);
      
      return {
        past: [...prev.past, prev.present],
        present: next,
        future: newFuture,
      };
    });
  }, []);
  
  const reset = useCallback((newState: T) => {
    setState({
      past: [],
      present: newState,
      future: [],
    });
  }, []);
  
  return {
    state: state.present,
    set,
    undo,
    redo,
    canUndo,
    canRedo,
    reset,
  };
}
