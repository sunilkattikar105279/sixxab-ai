// Minimal runtime that lets the design artboard's logic class run inside React.
import { useEffect, useReducer, useRef } from 'react';

export class DCLogic {
  constructor(props) {
    this.props = props || {};
    this.state = {};
  }
}

export function useDC(ComponentClass, props) {
  const [, force] = useReducer((x) => x + 1, 0);
  const ref = useRef(null);
  if (!ref.current) {
    const inst = new ComponentClass(props);
    inst.setState = (patch) => {
      const next = typeof patch === 'function' ? patch(inst.state, inst.props) : patch;
      inst.state = { ...inst.state, ...next };
      force();
    };
    inst.forceUpdate = () => force();
    ref.current = inst;
  }
  const inst = ref.current;
  inst.props = props || {};
  useEffect(() => {
    inst.componentDidMount?.();
    return () => inst.componentWillUnmount?.();
  }, []);
  return inst.renderVals();
}
