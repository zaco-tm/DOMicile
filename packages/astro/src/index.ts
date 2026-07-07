// Barrel for @domi/astro — re-exports all 15 components plus their Props types.
// Astro components are imported by filename, then re-exported with a friendly name.

export { default as Button } from './components/Button.astro';
export type { Props as ButtonProps } from './components/Button.astro';
export type { ButtonVariant, ButtonSize } from './types';

export { default as Card } from './components/Card.astro';
export type { Props as CardProps } from './components/Card.astro';
export type { CardSize } from './types';

export { default as Form } from './components/Form.astro';
export type { Props as FormProps } from './components/Form.astro';

export { default as Input } from './components/Input.astro';
export type { Props as InputProps } from './components/Input.astro';
export type { InputSize } from './types';

export { default as Select } from './components/Select.astro';
export type { Props as SelectProps } from './components/Select.astro';
export type { SelectSize } from './types';

export { default as Checkbox } from './components/Checkbox.astro';
export type { Props as CheckboxProps } from './components/Checkbox.astro';

export { default as Radio } from './components/Radio.astro';
export type { Props as RadioProps } from './components/Radio.astro';

export { default as Table } from './components/Table.astro';
export type { Props as TableProps } from './components/Table.astro';

export { default as Nav } from './components/Nav.astro';
export type { Props as NavProps } from './components/Nav.astro';

export { default as Tabs } from './components/Tabs.astro';
export type { Props as TabsProps } from './components/Tabs.astro';

export { default as Modal } from './components/Modal.astro';
export type { Props as ModalProps } from './components/Modal.astro';

export { default as Alert } from './components/Alert.astro';
export type { Props as AlertProps } from './components/Alert.astro';
export type { AlertVariant } from './types';

export { default as Badge } from './components/Badge.astro';
export type { Props as BadgeProps } from './components/Badge.astro';
export type { BadgeVariant } from './types';

export { default as Toast } from './components/Toast.astro';
export type { Props as ToastProps } from './components/Toast.astro';

export { default as Tooltip } from './components/Tooltip.astro';
export type { Props as TooltipProps } from './components/Tooltip.astro';