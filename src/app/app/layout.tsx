export const metadata = {
  title: "MnemoVault — IDE",
};

export default function IDELayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="h-screen overflow-hidden">
      {children}
    </div>
  );
}
