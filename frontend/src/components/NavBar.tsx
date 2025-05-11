// NavBar.tsx
import { useLocation, useNavigate } from "react-router-dom";
import { MdOutlineArrowBackIosNew } from "react-icons/md";
import { GiTeacher } from "react-icons/gi"; // You can replace this with a more generic "Model" or "Chat" icon

const NavBar = () => {
  const location = useLocation();
  const currentPath = location.pathname;
  const navigate = useNavigate();

  let buttonContent = null;

  if (currentPath.startsWith("/library/pdf")) {
    buttonContent = (
      <>
        <GiTeacher className="text-xl text-sky-600" />
        <span className="font-medium text-sm text-sky-700">AI Tutor</span>
      </>
    );
  } else if (currentPath.startsWith("/model-page")) {
    buttonContent = (
      <>
        <MdOutlineArrowBackIosNew className="text-xl text-slate-600" />
        <span className="font-medium text-sm text-slate-700">
          View Document
        </span>
      </>
    );
  }
  // Consider a more generic title or breadcrumbs for other pages.
  // For now, the button only appears for these two pages.

  return (
    <div className="bg-white w-4/5 h-16 absolute top-0 left-1/5 border-b border-slate-200">
      {" "}
      {/* Changed bg, slightly softer border */}
      <div className="flex items-center justify-start w-full h-full px-6">
        {" "}
        {/* Increased padding */}
        {buttonContent && (
          <button
            className="hover:bg-slate-100 py-2 px-3 rounded-md cursor-pointer flex items-center gap-2 transition-colors duration-150 ease-in-out"
            onClick={() => {
              if (currentPath.startsWith("/library/pdf")) {
                navigate("/model-page");
              } else if (currentPath.startsWith("/model-page")) {
                navigate("/library/pdf"); // Assuming PDF is the primary thing to go back to from model
              }
            }}
          >
            {buttonContent}
          </button>
        )}
        {/* You could add a page title here dynamically based on 'currentPath' */}
        {/* <h1 className="text-lg font-semibold text-slate-800 ml-4">{getPageTitle(currentPath)}</h1> */}
      </div>
    </div>
  );
};

export default NavBar;
