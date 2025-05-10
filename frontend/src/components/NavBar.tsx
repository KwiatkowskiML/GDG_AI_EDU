const NavBar = () => {
  return (
    <div className="bg-gray-100 w-full h-16 absolute top-0 left-1/12 border-b-2 border-gray-300">
      <div className="flex items-center justify-center w-full h-full">
        <button className="hover:bg-sky-200 py-2 px-4 rounded-2xl cursor-pointer">
          <h2 className="text-xl">Add</h2>
        </button>
      </div>
    </div>
  );
};

export default NavBar;
