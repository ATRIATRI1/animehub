import { useEffect, useState } from 'react';
import { subscribe } from '../services/dataAccess';

// 数据变更后触发组件重新拉取
export function useReload(): number {
  const [v, setV] = useState(0);
  useEffect(() => subscribe(() => setV((x) => x + 1)), []);
  return v;
}
