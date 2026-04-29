interface HeaderProps {
  title?: string;
  subtitle?: string;
}

export const Header: React.FC<HeaderProps> = ({ 
  title = "Despacho App", 
  subtitle = "Gestión de despacho" 
}) => {
  return (
    <header className="bg-white shadow">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <h1 className="text-3xl font-bold text-gray-900">{title}</h1>
        {subtitle && <p className="text-gray-600 mt-2">{subtitle}</p>}
      </div>
    </header>
  );
};
