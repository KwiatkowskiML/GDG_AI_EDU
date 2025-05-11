// LibraryPage.tsx
import { useNavigate } from "react-router-dom";
import { FaFilePdf } from "react-icons/fa"; // Example PDF icon

const LibraryPage = () => {
  const navigate = useNavigate();

  // Assuming your content area is defined by the absolute positioning in App.tsx
  // This div provides padding *within* that content area
  return (
    <div className="absolute top-16 left-1/5 w-4/5 h-3/4"> {/* Background color for the content area */}
      <div className="p-4 md:p-6 lg:p-8">
        {" "}
        {/* Padding for content */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
          {/* Example Card for PDF */}
          <div
            className="bg-white rounded-xl shadow-md hover:shadow-lg transition-all duration-300 ease-in-out overflow-hidden cursor-pointer group transform hover:-translate-y-1"
            onClick={() => navigate("/library/pdf")}
          >
            <div className="p-6 flex flex-col items-center text-center">
              <FaFilePdf className="w-16 h-16 text-red-500 mb-4 transition-transform duration-300 group-hover:scale-110" />
              <h3 className="text-lg font-semibold text-slate-700 mb-1">
                View Document
              </h3>
              <p className="text-xs text-slate-500">
                Open the AI-assisted PDF reader.
              </p>
            </div>
            {/* You could add a subtle footer or accent border to the card */}
            <div className="bg-slate-50 px-6 py-3 text-right">
              <span className="text-xs font-medium text-sky-600 group-hover:text-sky-700">
                Open →
              </span>
            </div>
          </div>

          {/* Add more cards here for other library items */}
          {/* <div className="bg-white rounded-xl shadow-md ..."> Another Item </div> */}
        </div>
      </div>
    </div>
  );
};

export default LibraryPage;
