import { ReactNode } from 'react';

interface ButtonProps {
  children: ReactNode;
  onClick?: () => void;
  variant?: 'primary' | 'secondary' | 'danger';
  disabled?: boolean;
  className?: string;
}

export const Button: React.FC<ButtonProps> = ({
  children,
  onClick,
  variant = 'primary',
  disabled = false,
  className = '',
}) => {
  const baseStyles = 'font-bold py-2 px-4 rounded transition-colors duration-200';
  
  const variantStyles = {
    primary: 'bg-blue-500 hover:bg-blue-700 text-white disabled:bg-blue-300',
    secondary: 'bg-gray-500 hover:bg-gray-700 text-white disabled:bg-gray-300',
    danger: 'bg-red-500 hover:bg-red-700 text-white disabled:bg-red-300',
  };

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`${baseStyles} ${variantStyles[variant]} ${className}`}
    >
      {children}
    </button>
  );
};
