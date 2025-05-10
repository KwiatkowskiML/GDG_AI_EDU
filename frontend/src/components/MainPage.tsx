import FlashcardsPage from "./FlashcardsPage";
import LibraryPage from "./LibraryPage";
import type { ActiveSideBarItem } from "./SideBar";

type MainPageProps = {
  currentActiveItem: ActiveSideBarItem;
};

const MainPage = ({ currentActiveItem }: MainPageProps) => {
  return (
    <div className="absolute left-1/5 top-16 w-full">
      {currentActiveItem === "Library" ? <LibraryPage /> : <FlashcardsPage />}
    </div>
  );
};

export default MainPage;
