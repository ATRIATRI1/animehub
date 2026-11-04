import { Moon, Sun } from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';
import { IconButton } from './primitives';

export function ThemeToggle() {
  const { theme, toggle } = useTheme();
  return (
    <IconButton onClick={toggle} title="切换主题（Aurora / Sakura）" active={theme === 'sakura'}>
      {theme === 'aurora' ? <Moon size={18} /> : <Sun size={18} />}
    </IconButton>
  );
}
