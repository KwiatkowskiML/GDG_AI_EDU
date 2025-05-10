import { useState } from "react";
import MainPage from "./components/MainPage";
import NavBar from "./components/NavBar";
import SideBar, { type ActiveSideBarItem } from "./components/SideBar";

function App() {
  const [currentActiveItem, setCurrentActiveItem] =
    useState<ActiveSideBarItem>("Library");

  const handleActiveItemChange = (item: ActiveSideBarItem) => {
    setCurrentActiveItem(item);
  };

  return (
    <>
      <NavBar />
      <MainPage currentActiveItem={currentActiveItem}/>
      <SideBar activeItem={currentActiveItem} name="Jakub" handleActiveItemChange={handleActiveItemChange} />
    </>
  );
}

export default App;
