import { useLocation, useNavigate } from "react-router-dom";

export type ActiveSideBarItem = "Library" | "Flashcards";

export interface SideBarProps {
  name: string;
}

const SideBar = ({ name }: SideBarProps) => {
  const location = useLocation();
  const currentPath = location.pathname;
  const isLibraryPage = currentPath === "/library";
  const isFlashcardsPage = currentPath === "/flashcards";
  const navigate = useNavigate();

  return (
    <div className="bg-gray-100 w-1/5 h-full absolute top-0 left-0 border-r-2 border-gray-300">
      <div className="m-4">
        <h2 className="text-xl">{name}</h2>
      </div>
      <div className="flex px-4 h-16 flex-col mt-14 gap-14 ml-6">
        <div>
          <button
            className={`hover:bg-sky-200 w-1/2 rounded-2xl p-2 ${
              isLibraryPage ? "bg-sky-200" : ""
            } cursor-pointer`}
            onClick={() => {
              navigate("/library");
            }}
          >
            <h2>Library</h2>
          </button>
        </div>
        <div>
          <button
            className={`hover:bg-sky-200 w-1/2 rounded-2xl p-2 ${
              isFlashcardsPage ? "bg-sky-200" : ""
            } cursor-pointer`}
            onClick={() => {
              navigate("/flashcards");
            }}
          >
            <h2>Flashcards</h2>
          </button>
        </div>
      </div>
    </div>
  );
};
export default SideBar;
