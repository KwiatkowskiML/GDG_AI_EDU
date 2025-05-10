import {
  BrowserRouter as Router,
  Routes,
  Route,
  Navigate,
} from "react-router-dom";
import NavBar from "./components/NavBar";
import SideBar from "./components/SideBar";
import PdfViewer from "./components/PdfViewer";
import LibraryPage from "./components/LibraryPage";
import FlashcardsPage from "./components/FlashcardsPage";

function App() {
  return (
    <Router>
      <NavBar />
      <SideBar name="Jakub" />
      <Routes>
        <Route path="/" element={<Navigate to="/library" />} />
        <Route path="/library" element={<LibraryPage />} />
        <Route path="/library/pdf" element={<PdfViewer />} />
        <Route path="/flashcards" element={<FlashcardsPage />} />
      </Routes>
    </Router>
  );
}

export default App;
