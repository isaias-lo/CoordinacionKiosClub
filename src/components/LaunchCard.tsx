import React from 'react';

interface LaunchCardProps {
  title: string;
  subtitle: string;
  icon: string;
  primary?: boolean;
  disabled?: boolean;
  onClick: () => void;
}

export const LaunchCard: React.FC<LaunchCardProps> = ({
  title,
  subtitle,
  icon,
  primary = false,
  disabled = false,
  onClick,
}) => {
  const baseClasses = "launch-card";
  const primaryClasses = primary ? "primary" : "secondary";
  const disabledClasses = disabled ? "disabled-card" : "";

  return (
    <div
      className={`${baseClasses} ${primaryClasses} ${disabledClasses}`}
      onClick={disabled ? undefined : onClick}
    >
      <div className="lc-icon">{icon}</div>
      <div className="lc-title">{title}</div>
      <div className="lc-sub">{subtitle}</div>
    </div>
  );
};
