// SideBar.tsx
import { useLocation, useNavigate } from "react-router-dom";
// Assuming you might use react-icons, for example:
import { LuLayoutDashboard, LuListChecks } from "react-icons/lu"; // Example icons

export type ActiveSideBarItem = "Library" | "Flashcards";

export interface SideBarProps {
  name: string;
}

const SideBar = ({ name }: SideBarProps) => {
  const location = useLocation();
  const currentPath = location.pathname;
  // More robust active check:
  const isActive = (pathPrefix: string) => currentPath.startsWith(pathPrefix);

  const navigate = useNavigate();

  const navItems = [
    { name: "Library", path: "/library", icon: <LuLayoutDashboard className="mr-3 text-xl" /> },
    { name: "Flashcards", path: "/flashcards", icon: <LuListChecks className="mr-3 text-xl" /> },
    // Add "/model-page" if it's a distinct top-level navigation item
    // { name: "AI Model", path: "/model-page", icon: <SomeIcon className="mr-3 text-xl" /> }
  ];

  return (
    <div className="bg-slate-50 w-1/5 h-full absolute top-0 left-0 border-r border-slate-200 flex flex-col">
      <div className="p-6 border-b border-slate-200"> {/* Increased padding, added bottom border */}
        <h2 className="text-2xl font-semibold text-slate-700 truncate">{name}</h2>
      </div>
      <nav className="flex-grow px-4 py-6 space-y-3"> {/* Replaced mt/gap with space-y for consistent spacing */}
        {navItems.map((item) => (
          <button
            key={item.name}
            className={`w-full flex items-center text-left rounded-lg p-3 transition-colors duration-150 ease-in-out
                        ${
                          isActive(item.path)
                            ? "bg-sky-100 text-sky-700 font-medium"
                            : "text-slate-600 hover:bg-slate-200 hover:text-slate-800"
                        }
                      `}
            onClick={() => {
              navigate(item.path);
            }}
          >
            {item.icon}
            <span className="text-sm">{item.name}</span>
          </button>
        ))}
      </nav>
      {/* You could add a footer to the sidebar here if needed */}
    </div>
  );
};
export default SideBar;