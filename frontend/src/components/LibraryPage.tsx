import { useNavigate } from "react-router-dom";

const LibraryPage = () => {
  const navigate = useNavigate();

  return (
    <div className="absolute top-16 left-1/5 w-4/5 h-3/4">
      <div className="flex flex-col items-center justify-center w-1/5 h-1/2 m-4 bg-white rounded-lg shadow-lg">
        <button
          className="cursor-pointer w-full h-full hover:shadow-2xl transition duration-300 ease-in-out"
          onClick={() => navigate("/library/pdf")}
        >
          <h3>PDF</h3>
        </button>
      </div>
    </div>
  );
};

export default LibraryPage;
