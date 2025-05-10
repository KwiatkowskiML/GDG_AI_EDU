const PdfViewer = () => {
  return (
    <div className="absolute top-16 left-1/5 w-4/5 h-3/4 flex justify-center items-center mt-20">
      <object
        width="50%"
        height="100%"
        data="https://www.livros1.com.br/pdf-read/livar/HAMLET.pdf"
        type="application/pdf"
      >
        {" "}
      </object>
    </div>
  );
};

export default PdfViewer;
