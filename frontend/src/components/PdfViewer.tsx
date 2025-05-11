// PdfViewer.tsx
const PdfViewer = () => {
  return (
    // This container already has absolute positioning and sizing from its parent route/ModelPage's sibling div
    // To fill the space: h-full
    // To add padding: p-4 (if the NavBar is not overlapping and page has no other top/left offset)
    // For this component, absolute with offsets seems intended by your structure
    <div className="absolute top-16 left-1/5 w-4/5 h-[calc(100%-4rem)] flex flex-col items-center pt-2 pb-4 px-4"> {/* h-screen without navbar height */}
      {/* <h2 className="text-xl font-semibold text-slate-700 mb-4">Document Viewer</h2> Uncomment if you want a title */}
      <object
        className="w-full max-w-4xl h-full rounded-lg shadow-lg" // max-w-4xl for readability, or w-full
        data="https://www.livros1.com.br/pdf-read/livar/HAMLET.pdf" // Make sure CORS allows this
        type="application/pdf"
      >
        <p className="p-4 text-slate-600">
          It appears your browser does not support embedding PDFs.
          You can <a href="https://www.livros1.com.br/pdf-read/livar/HAMLET.pdf" className="text-sky-600 hover:underline">download the PDF</a> instead.
        </p>
      </object>
    </div>
  );
};

export default PdfViewer;