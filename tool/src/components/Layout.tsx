interface LayoutProps {
  children: React.ReactNode;
}

export default function Layout({ children }: LayoutProps) {
  return (
    <div className="max-w-md mx-auto px-5 py-8 pb-16">
      {children}
    </div>
  );
}
