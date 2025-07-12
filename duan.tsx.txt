import React, { useState, useEffect } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, collection, addDoc, onSnapshot, query, serverTimestamp } from 'firebase/firestore';

// Component for the AI Chat Assistant Modal
const AIChatAssistantModal = ({ isOpen, onClose, services }) => {
  const [userInput, setUserInput] = useState('');
  const [chatHistory, setChatHistory] = useState([]);
  const [isGenerating, setIsGenerating] = useState(false);

  const generateResponse = async (prompt) => {
    setIsGenerating(true);
    setChatHistory((prev) => [...prev, { role: 'user', parts: [{ text: prompt }] }]);

    // Prepare service data for the LLM
    const serviceDataForLLM = services.map(s => ({
      name: s.name,
      description: s.description,
      category: s.category
    })).join('\n'); // Simple string concatenation for now

    const llmPrompt = `Bạn là một trợ lý ảo am hiểu về các dịch vụ sau đây. Dựa trên mô tả của người dùng, hãy gợi ý các dịch vụ phù hợp nhất và giải thích ngắn gọn tại sao. Nếu không có dịch vụ nào phù hợp, hãy thông báo cho người dùng.
      Các dịch vụ của chúng tôi:
      ${serviceDataForLLM}

      Nhu cầu của người dùng: "${prompt}"
      Gợi ý của bạn:
    `;

    try {
      const payload = {
        contents: [{ role: "user", parts: [{ text: llmPrompt }] }],
        generationConfig: {
          temperature: 0.7, // Adjust creativity
          topP: 0.95,
          topK: 40,
        },
      };

      const apiKey = ""; // Canvas will provide this at runtime
      const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const result = await response.json();
      if (result.candidates && result.candidates.length > 0 &&
          result.candidates[0].content && result.candidates[0].content.parts &&
          result.candidates[0].content.parts.length > 0) {
        const text = result.candidates[0].content.parts[0].text;
        setChatHistory((prev) => [...prev, { role: 'model', parts: [{ text: text }] }]);
      } else {
        setChatHistory((prev) => [...prev, { role: 'model', parts: [{ text: 'Xin lỗi, tôi không thể tạo ra gợi ý lúc này. Vui lòng thử lại sau.' }] }]);
      }
    } catch (error) {
      console.error('Error calling Gemini API:', error);
      setChatHistory((prev) => [...prev, { role: 'model', parts: [{ text: 'Đã xảy ra lỗi khi kết nối với AI. Vui lòng thử lại.' }] }]);
    } finally {
      setIsGenerating(false);
      setUserInput(''); // Clear input after sending
    }
  };

  const handleSendMessage = () => {
    if (userInput.trim()) {
      generateResponse(userInput.trim());
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center p-4 z-50 animate-fadeIn">
      <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full p-6 relative animate-scaleIn flex flex-col h-[80vh]">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-gray-500 hover:text-gray-900 text-4xl font-bold transition-colors duration-200"
          aria-label="Đóng trợ lý AI"
        >
          &times;
        </button>
        <h2 className="text-3xl font-bold text-gray-900 mb-4 text-center border-b pb-2">✨ Trợ lý Dịch vụ AI ✨</h2>

        {/* Chat History */}
        <div className="flex-grow overflow-y-auto mb-4 p-2 border rounded-lg bg-gray-50">
          {chatHistory.map((msg, index) => (
            <div key={index} className={`mb-2 ${msg.role === 'user' ? 'text-right' : 'text-left'}`}>
              <span className={`inline-block px-3 py-2 rounded-lg ${msg.role === 'user' ? 'bg-blue-500 text-white' : 'bg-gray-200 text-gray-800'}`}>
                {msg.parts[0].text}
              </span>
            </div>
          ))}
          {isGenerating && (
            <div className="text-center text-gray-500 italic">
              AI đang suy nghĩ...
            </div>
          )}
        </div>

        {/* User Input */}
        <div className="flex gap-2">
          <input
            type="text"
            className="flex-grow p-3 border border-gray-300 rounded-full focus:outline-none focus:ring-2 focus:ring-indigo-500"
            placeholder="Mô tả nhu cầu của bạn (ví dụ: 'tôi cần vay tiền mua nhà')"
            value={userInput}
            onChange={(e) => setUserInput(e.target.value)}
            onKeyPress={(e) => { if (e.key === 'Enter') handleSendMessage(); }}
            disabled={isGenerating}
          />
          <button
            onClick={handleSendMessage}
            className="p-3 bg-indigo-600 text-white rounded-full hover:bg-indigo-700 transition-colors duration-200 shadow-md flex items-center justify-center"
            disabled={isGenerating || !userInput.trim()}
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M14 5l7 7m0 0l-7 7m7-7H3"></path>
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
};

// Component for Service Comparison Modal
const ServiceComparisonModal = ({ isOpen, onClose, services }) => {
  const [service1, setService1] = useState('');
  const [service2, setService2] = useState('');
  const [comparisonResult, setComparisonResult] = useState(null);
  const [isComparing, setIsComparing] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const handleCompare = async () => {
    setComparisonResult(null);
    setErrorMessage('');

    if (!service1 || !service2) {
      setErrorMessage('Vui lòng chọn cả hai dịch vụ để so sánh.');
      return;
    }
    if (service1 === service2) {
      setErrorMessage('Vui lòng chọn hai dịch vụ khác nhau để so sánh.');
      return;
    }

    setIsComparing(true);
    const s1Data = services.find(s => s.id === service1);
    const s2Data = services.find(s => s.id === service2);

    const llmPrompt = `Hãy so sánh hai dịch vụ sau đây, làm nổi bật điểm giống, khác nhau và đối tượng khách hàng/lợi ích chính của mỗi dịch vụ. Trình bày dưới dạng dễ hiểu, có thể sử dụng gạch đầu dòng hoặc bảng nếu phù hợp.

    Dịch vụ 1: ${s1Data.name}
    Mô tả: ${s1Data.longDescription}

    Dịch vụ 2: ${s2Data.name}
    Mô tả: ${s2Data.longDescription}

    So sánh:
    `;

    try {
      const payload = {
        contents: [{ role: "user", parts: [{ text: llmPrompt }] }],
        generationConfig: {
          temperature: 0.6, // Balanced creativity for comparison
          topP: 0.9,
          topK: 40,
        },
      };

      const apiKey = ""; // Canvas will provide this at runtime
      const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const result = await response.json();
      if (result.candidates && result.candidates.length > 0 &&
          result.candidates[0].content && result.candidates[0].content.parts &&
          result.candidates[0].content.parts.length > 0) {
        const text = result.candidates[0].content.parts[0].text;
        setComparisonResult(text);
      } else {
        setComparisonResult('Không thể tạo so sánh lúc này. Vui lòng thử lại sau.');
      }
    } catch (error) {
      console.error('Error calling Gemini API for comparison:', error);
      setComparisonResult('Đã xảy ra lỗi khi kết nối với AI. Vui lòng thử lại.');
    } finally {
      setIsComparing(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center p-4 z-50 animate-fadeIn overflow-auto">
      <div className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full p-8 relative animate-scaleIn flex flex-col max-h-[90vh]">
        <button
          onClick={() => {
            onClose();
            setService1('');
            setService2('');
            setComparisonResult(null);
            setErrorMessage('');
          }}
          className="absolute top-4 right-4 text-gray-500 hover:text-gray-900 text-4xl font-bold transition-colors duration-200"
          aria-label="Đóng công cụ so sánh"
        >
          &times;
        </button>
        <h2 className="text-3xl font-bold text-gray-900 mb-6 text-center border-b pb-2">✨ So sánh Dịch vụ ✨</h2>

        <div className="flex flex-col md:flex-row gap-6 mb-6">
          <div className="md:w-1/2">
            <label htmlFor="service1-select" className="block text-gray-700 text-lg font-semibold mb-2">
              Chọn Dịch vụ 1:
            </label>
            <select
              id="service1-select"
              className="w-full p-3 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 text-lg"
              value={service1}
              onChange={(e) => setService1(e.target.value)}
            >
              <option value="">-- Chọn dịch vụ --</option>
              {services.map(s => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>
          <div className="md:w-1/2">
            <label htmlFor="service2-select" className="block text-gray-700 text-lg font-semibold mb-2">
              Chọn Dịch vụ 2:
            </label>
            <select
              id="service2-select"
              className="w-full p-3 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 text-lg"
              value={service2}
              onChange={(e) => setService2(e.target.value)}
            >
              <option value="">-- Chọn dịch vụ --</option>
              {services.map(s => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>
        </div>

        {errorMessage && (
          <p className="text-red-600 text-center mb-4">{errorMessage}</p>
        )}

        <div className="text-center mb-6">
          <button
            onClick={handleCompare}
            className="inline-flex items-center px-8 py-4 bg-gradient-to-r from-purple-600 to-pink-600 text-white font-bold rounded-full shadow-lg hover:from-purple-700 hover:to-pink-700 transition-all duration-300 transform hover:scale-105 text-lg"
            disabled={isComparing || !service1 || !service2 || service1 === service2}
          >
            {isComparing ? (
              <>
                <div className="animate-spin rounded-full h-6 w-6 border-t-2 border-b-2 border-white mr-3"></div>
                Đang so sánh...
              </>
            ) : (
              <>
                <svg className="w-6 h-6 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4"></path>
                </svg>
                So sánh ✨
              </>
            )}
          </button>
        </div>

        {comparisonResult && (
          <div className="flex-grow overflow-y-auto bg-gray-100 p-6 rounded-lg shadow-inner animate-fadeInContent">
            <h3 className="text-2xl font-bold text-gray-900 mb-4">Kết quả so sánh:</h3>
            <div className="prose max-w-none text-gray-700" dangerouslySetInnerHTML={{ __html: comparisonResult.replace(/\n/g, '<br/>') }}></div>
          </div>
        )}
      </div>
    </div>
  );
};


// Main App component
const App = () => {
  // Firebase states
  const [db, setDb] = useState(null);
  const [auth, setAuth] = useState(null);
  const [userId, setUserId] = useState(null);
  const [isAuthReady, setIsAuthReady] = useState(false);

  // UI states
  const [activeCategory, setActiveCategory] = useState('Tất cả');
  const [selectedService, setSelectedService] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showScrollToTop, setShowScrollToTop] = useState(false);
  const [openFaqId, setOpenFaqId] = useState(null);
  const [isNavOpen, setIsNavOpen] = useState(false); // For mobile hamburger menu
  const [isAIChatOpen, setIsAIChatOpen] = useState(false); // State for AI Chat Modal
  const [isComparisonModalOpen, setIsComparisonModalOpen] = useState(false); // State for Comparison Modal

  // AI-generated states for selected service details
  const [generatedServiceBenefits, setGeneratedServiceBenefits] = useState(null);
  const [isGeneratingBenefits, setIsGeneratingBenefits] = useState(false);
  // New states for specific service question/answer
  const [specificServiceQuestion, setSpecificServiceQuestion] = useState('');
  const [specificServiceAnswer, setSpecificServiceAnswer] = useState(null);
  const [isAskingSpecificService, setIsAskingSpecificService] = useState(false);


  // Form states for Contact Form
  const [contactName, setContactName] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [contactMessage, setContactMessage] = useState('');
  const [formFeedback, setFormFeedback] = useState('');

  // Testimonials state, now fetched from Firestore
  const [testimonials, setTestimonials] = useState([]);

  // Mock data for services, categories, banners, and FAQs (remains local for simplicity)
  const services = [
    {
      id: 'pos-machine',
      name: "Máy POS",
      description: "Giải pháp thanh toán hiện đại, giúp bạn dễ dàng quản lý giao dịch và tối ưu hóa quy trình bán hàng.",
      longDescription: "Máy POS (Point of Sale) của chúng tôi là thiết bị thanh toán tiên tiến, cho phép bạn chấp nhận thanh toán qua thẻ tín dụng/ghi nợ, ví điện tử một cách nhanh chóng và an toàn. Tích hợp phần mềm quản lý bán hàng, máy POS giúp bạn theo dõi doanh thu, quản lý kho hàng và in hóa đơn tức thì, tối ưu hóa quy trình vận hành cho mọi loại hình kinh doanh từ cửa hàng nhỏ đến chuỗi siêu thị. Các tính năng nổi bật: Quản lý giao dịch, báo cáo doanh thu, tích hợp tồn kho, hỗ trợ đa dạng phương thức thanh toán.",
      imageUrl: "http://googleusercontent.com/image_generation_content/4",
      category: "Giải pháp kinh doanh"
    },
    {
      id: 'tingbox',
      name: "Tingbox",
      description: "Nâng tầm trải nghiệm kinh doanh của bạn với thiết bị đa năng này.",
      longDescription: "Tingbox là một giải pháp tổng hợp, cung cấp các tính năng quản lý khách hàng (CRM), tự động hóa marketing, và phân tích dữ liệu hiệu quả. Nó giúp doanh nghiệp nhỏ và vừa dễ dàng tiếp cận công nghệ để nâng cao tương tác với khách hàng, tối ưu hóa chiến dịch quảng cáo, và đưa ra quyết định kinh doanh dựa trên dữ liệu chính xác, từ đó thúc đẩy tăng trưởng doanh thu. Lợi ích: Tăng hiệu suất, quản lý thông minh, tiết kiệm chi phí, hỗ trợ đa nền tảng.",
      imageUrl: "https://placehold.co/600x400/543d6b/fff?text=Tingbox",
      category: "Giải pháp kinh doanh"
    },
    {
      id: 'credit-withdrawal',
      name: "Rút tiền tín dụng",
      description: "Đáp ứng nhu cầu tài chính cấp bách của bạn một cách nhanh chóng và an toàn.",
      longDescription: "Dịch vụ rút tiền tín dụng của chúng tôi cho phép bạn nhanh chóng chuyển đổi hạn mức tín dụng từ thẻ của mình thành tiền mặt, đáp ứng các nhu cầu chi tiêu khẩn cấp. Với quy trình đơn giản, bảo mật cao và mức phí cạnh tranh, chúng tôi đảm bảo bạn có thể tiếp cận nguồn vốn cần thiết mà không gặp trở ngại. Đặc điểm: Thủ tục đơn giản, giải ngân nhanh chóng, bảo mật thông tin, hỗ trợ 24/7.",
      imageUrl: "http://googleusercontent.com/image_generation_content/6",
      category: "Dịch vụ tài chính"
    },
    {
      id: 'consumer-loan-collateral',
      name: "Khoản vay tiêu dùng + thế chấp tài sản",
      description: "Giải pháp tài chính linh hoạt, giúp bạn thực hiện các kế hoạch cá nhân hoặc kinh doanh với sự hỗ trợ từ tài sản thế chấp.",
      longDescription: "Chúng tôi cung cấp các gói vay tiêu dùng linh hoạt, có hoặc không có tài sản thế chấp, phù hợp với mọi nhu cầu từ mua sắm, học tập, đến khởi nghiệp. Đặc biệt, với các khoản vay thế chấp tài sản (như nhà đất, xe hơi), bạn có thể tiếp cận hạn mức vay lớn hơn với lãi suất ưu đãi, giúp bạn hiện thực hóa các kế hoạch tài chính lớn của mình. Ưu điểm: Lãi suất cạnh tranh, duyệt hồ sơ nhanh, hạn mức vay cao, thời gian trả nợ linh hoạt.",
      imageUrl: "http://googleusercontent.com/image_generation_content/7",
      category: "Dịch vụ tài chính"
    },
    {
      id: 'sim-card',
      name: "SIM số",
      description: "Lựa chọn SIM số phù hợp với phong thủy, cá tính hoặc nhu cầu kinh doanh của bạn.",
      longDescription: "Kho SIM số đa dạng của chúng tôi bao gồm các loại SIM số đẹp, SIM phong thủy, SIM tứ quý, ngũ quý, lộc phát, thần tài và nhiều loại khác, phù hợp với mọi nhu cầu cá nhân hay kinh doanh. Chúng tôi cam kết cung cấp SIM chính chủ, thủ tục nhanh gọn, giúp bạn sở hữu số điện thoại ưng ý và may mắn. Lựa chọn: SIM VIP, SIM phong thủy, SIM theo yêu cầu, hỗ trợ đăng ký chính chủ.",
      imageUrl: "http://googleusercontent.com/image_generation_content/8",
      category: "Viễn thông & Ngân hàng"
    },
    {
      id: 'bank-accounts',
      name: "Tài khoản ngân hàng OCB, BIDV",
      description: "Mở tài khoản ngân hàng dễ dàng tại các ngân hàng uy tín hàng đầu như OCB, BIDV và nhiều ngân hàng khác.",
      longDescription: "Chúng tôi hỗ trợ khách hàng mở tài khoản ngân hàng tại các tổ chức tài chính hàng đầu như OCB, BIDV và nhiều ngân hàng uy tín khác. Dịch vụ bao gồm tư vấn chọn gói tài khoản phù hợp (tiết kiệm, thanh toán, ưu đãi), hỗ trợ thủ tục nhanh gọn, và cung cấp thông tin chi tiết về các tiện ích như internet banking, mobile banking, thẻ thanh toán, đảm bảo sự tiện lợi tối đa cho bạn. Tiện ích: Internet Banking, Mobile Banking, Thẻ ATM/Visa/MasterCard, ưu đãi phí giao dịch.",
      imageUrl: "http://googleusercontent.com/image_generation_content/0",
      category: "Viễn thông & Ngân hàng"
    },
    {
      id: 'phone-accessories',
      name: "Phụ kiện điện thoại",
      description: "Đa dạng phụ kiện chất lượng cao, bảo vệ và nâng cao trải nghiệm sử dụng điện thoại của bạn.",
      longDescription: "Chúng tôi cung cấp đầy đủ các loại phụ kiện điện thoại chính hãng và chất lượng cao như ốp lưng, kính cường lực, sạc dự phòng, tai nghe, cáp sạc, gậy selfie... Các sản phẩm được lựa chọn kỹ lưỡng, đảm bảo độ bền và tính tương thích cao, giúp bảo vệ thiết bị và tối ưu hóa trải nghiệm sử dụng của bạn. Sản phẩm: Ốp lưng, kính cường lực, sạc dự phòng, tai nghe, cáp sạc, thiết bị Bluetooth.",
      imageUrl: "http://googleusercontent.com/image_generation_content/2",
      category: "Thiết bị điện tử"
    },
    {
      id: 'smartphones',
      name: "Điện thoại",
      description: "Cung cấp các dòng điện thoại mới nhất, đáp ứng mọi nhu cầu từ học tập, làm việc đến giải trí.",
      longDescription: "Chúng tôi là đối tác của các thương hiệu điện thoại hàng đầu thế giới, mang đến cho bạn những mẫu smartphone mới nhất với đa dạng cấu hình, tính năng và mức giá. Từ điện thoại phổ thông đến các dòng cao cấp, chúng tôi đảm bảo cung cấp sản phẩm chính hãng, bảo hành uy tín và dịch vụ hậu mãi chu đáo. Thương hiệu: Samsung, iPhone, Oppo, Xiaomi, Vivo. Mẫu mã đa dạng, bảo hành chính hãng.",
      imageUrl: "http://googleusercontent.com/image_generation_content/9",
      category: "Thiết bị điện tử"
    },
    {
      id: 'laptops',
      name: "Laptop",
      description: "Cung cấp các dòng laptop mới nhất, đáp ứng mọi nhu cầu từ học tập, làm việc đến giải trí.",
      longDescription: "Cửa hàng chúng tôi chuyên cung cấp các loại laptop từ văn phòng, học tập đến gaming, đồ họa, từ các thương hiệu uy tín. Mỗi chiếc laptop đều được kiểm tra kỹ lưỡng về chất lượng, hiệu năng và được bảo hành chính hãng. Chúng tôi cam kết mang đến cho bạn sản phẩm phù hợp nhất với nhu cầu và ngân sách, cùng với dịch vụ hỗ trợ kỹ thuật tận tình. Loại hình: Laptop văn phòng, gaming, đồ họa, siêu mỏng nhẹ. Cấu hình đa dạng, bảo hành dài hạn.",
      imageUrl: "http://googleusercontent.com/image_generation_content/10",
      category: "Thiết bị điện tử"
    },
    {
      id: 'car-sales',
      name: "Bán Xe Hơi",
      description: "Hỗ trợ tìm kiếm và sở hữu chiếc xe hơi ưng ý.",
      longDescription: "Dịch vụ bán xe hơi của chúng tôi bao gồm tư vấn lựa chọn xe phù hợp với nhu cầu và ngân sách, hỗ trợ thủ tục mua bán, đăng ký xe, và các dịch vụ hậu mãi. Chúng tôi cung cấp đa dạng các dòng xe từ xe đã qua sử dụng đến xe mới, đảm bảo nguồn gốc rõ ràng, chất lượng được kiểm định, giúp bạn an tâm sở hữu chiếc xe mơ ước. Dịch vụ: Tư vấn mua xe, hỗ trợ vay mua xe, đăng ký, đăng kiểm, bảo dưỡng sau bán.",
      imageUrl: "http://googleusercontent.com/image_generation_content/1",
      category: "Khác"
    }
  ];

  const categoryBannerImages = {
    'Tất cả': 'https://placehold.co/1920x600/a3e635/1c1c1c?text=Dich+Vu+Tong+Hop',
    'Giải pháp kinh doanh': 'https://placehold.co/1920x600/fcd34d/1c1c1c?text=Giai+Phap+Kinh+Doanh',
    'Dịch vụ tài chính': 'https://placehold.co/1920x600/60a5fa/1c1c1c?text=Dich+Vu+Tai+Chinh',
    'Viễn thông & Ngân hàng': 'https://placehold.co/1920x600/8b5cf6/1c1c1c?text=Vien+Thong+Ngan+Hang',
    'Thiết bị điện tử': 'https://placehold.co/1920x600/ef4444/1c1c1c?text=Thiet+Bi+Dien+Tu',
    'Khác': 'https://placehold.co/1920x600/34d399/1c1c1c?text=Dich+Vu+Khac',
  };

  const faqs = [
    {
      id: 'faq1',
      question: "Thời gian làm việc của các bạn là khi nào?",
      answer: "Chúng tôi hoạt động từ Thứ Hai đến Thứ Bảy, từ 8:00 sáng đến 17:00 chiều. Vui lòng liên hệ để đặt lịch hẹn ngoài giờ nếu cần."
    },
    {
      id: 'faq2',
      question: "Tôi có thể thanh toán bằng những hình thức nào?",
      answer: "Chúng tôi chấp nhận thanh toán bằng tiền mặt, chuyển khoản ngân hàng, và thanh toán qua máy POS bằng thẻ tín dụng/ghi nợ."
    },
    {
      id: 'faq3',
      question: "Chính sách bảo hành và đổi trả dịch vụ/sản phẩm như thế nào?",
      answer: "Mỗi dịch vụ và sản phẩm sẽ có chính sách bảo hành/đổi trả riêng biệt, được tư vấn chi tiết khi quý khách sử dụng dịch vụ hoặc mua sản phẩm. Chúng tôi cam kết hỗ trợ tốt nhất cho khách hàng."
    },
    {
      id: 'faq4',
      question: "Làm thế nào để được tư vấn về khoản vay tiêu dùng?",
      answer: "Quý khách có thể liên hệ trực tiếp qua số điện thoại 0363.79.89.89 (gặp Hiếu) hoặc điền vào form liên hệ trên trang web để nhận được tư vấn chi tiết từ chuyên viên của chúng tôi."
    }
  ];

  const processSteps = [
    {
      id: 'step1',
      title: "Bước 1: Liên hệ & Tư vấn",
      description: "Quý khách liên hệ qua hotline hoặc form, chúng tôi sẽ lắng nghe nhu cầu và đưa ra tư vấn phù hợp."
    },
    {
      id: 'step2',
      title: "Bước 2: Giải pháp & Đề xuất",
      description: "Chúng tôi đề xuất các sản phẩm/dịch vụ tối ưu, kèm theo báo giá và thông tin chi tiết."
    },
    {
      id: 'step3',
      title: "Bước 3: Triển khai & Hỗ trợ",
      description: "Tiến hành triển khai dịch vụ/giao sản phẩm và luôn đồng hành hỗ trợ quý khách trong suốt quá trình sử dụng."
    }
  ];

  // Firebase Initialization and Authentication
  useEffect(() => {
    try {
      const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
      const firebaseConfig = typeof __firebase_config !== 'undefined' ? JSON.parse(__firebase_config) : {};

      const app = initializeApp(firebaseConfig);
      const firestore = getFirestore(app);
      const firebaseAuth = getAuth(app);

      setDb(firestore);
      setAuth(firebaseAuth);

      const unsubscribe = onAuthStateChanged(firebaseAuth, async (user) => {
        if (!user) {
          try {
            if (typeof __initial_auth_token !== 'undefined') {
              await signInWithCustomToken(firebaseAuth, __initial_auth_token);
            } else {
              await signInAnonymously(firebaseAuth);
            }
          } catch (error) {
            console.error("Firebase Auth Error:", error);
          }
        }
        setUserId(firebaseAuth.currentUser?.uid || crypto.randomUUID());
        setIsAuthReady(true);
      });

      return () => unsubscribe();
    } catch (error) {
      console.error("Failed to initialize Firebase:", error);
      setIsAuthReady(true);
    }
  }, []);

  // Fetch testimonials from Firestore
  useEffect(() => {
    if (db && isAuthReady && userId) {
      const testimonialsCollectionRef = collection(db, `artifacts/${__app_id}/public/data/testimonials`);
      const q = query(testimonialsCollectionRef);

      const unsubscribe = onSnapshot(q, (snapshot) => {
        const fetchedTestimonials = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
        fetchedTestimonials.sort((a, b) => (b.timestamp?.toDate() || 0) - (a.timestamp?.toDate() || 0));
        setTestimonials(fetchedTestimonials);
      }, (error) => {
        console.error("Error fetching testimonials: ", error);
      });

      return () => unsubscribe();
    }
  }, [db, isAuthReady, userId]);


  const categories = ['Tất cả', ...new Set(services.map(service => service.category))];

  const filteredServices = services.filter(service => {
    const matchesCategory = activeCategory === 'Tất cả' || service.category === activeCategory;
    const matchesSearch = service.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          service.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          service.longDescription.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  // Function to open the service detail modal
  const openServiceModal = (service) => {
    setSelectedService(service);
    setGeneratedServiceBenefits(null); // Clear previous benefits when opening new modal
    setIsGeneratingBenefits(false); // Reset loading state
    setSpecificServiceQuestion(''); // Clear specific question input
    setSpecificServiceAnswer(null); // Clear specific answer
    setIsAskingSpecificService(false); // Reset specific question loading state
  };

  // Function to close the service detail modal
  const closeServiceModal = () => {
    setSelectedService(null);
    setGeneratedServiceBenefits(null); // Clear benefits on close
    setIsGeneratingBenefits(false); // Reset loading state
    setSpecificServiceQuestion(''); // Clear specific question input
    setSpecificServiceAnswer(null); // Clear specific answer
    setIsAskingSpecificService(false); // Reset specific question loading state
  };

  // Function to generate key benefits using Gemini API
  const generateKeyBenefits = async (longDescription) => {
    setIsGeneratingBenefits(true);
    setGeneratedServiceBenefits(null); // Clear previous results

    const llmPrompt = `Dựa trên mô tả dịch vụ sau, hãy liệt kê 3 đến 5 lợi ích chính của dịch vụ này, dưới dạng danh sách gạch đầu dòng (bullet points). Chỉ bao gồm các lợi ích và không thêm bất kỳ văn bản giới thiệu hay kết luận nào.
      Mô tả dịch vụ:
      "${longDescription}"
    `;

    try {
      const payload = {
        contents: [{ role: "user", parts: [{ text: llmPrompt }] }],
        generationConfig: {
          temperature: 0.5, // Less creative, more factual for benefits
          topP: 0.9,
          topK: 20,
        },
      };

      const apiKey = "";
      const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const result = await response.json();
      if (result.candidates && result.candidates.length > 0 &&
          result.candidates[0].content && result.candidates[0].content.parts &&
          result.candidates[0].content.parts.length > 0) {
        const text = result.candidates[0].content.parts[0].text;
        setGeneratedServiceBenefits(text);
      } else {
        setGeneratedServiceBenefits('Không thể tạo lợi ích chính lúc này. Vui lòng thử lại.');
      }
    } catch (error) {
      console.error('Error calling Gemini API for benefits:', error);
      setGeneratedServiceBenefits('Đã xảy ra lỗi khi tạo lợi ích. Vui lòng thử lại.');
    } finally {
      setIsGeneratingBenefits(false);
    }
  };

  // Function to ask AI about a specific service
  const askAboutSpecificService = async (serviceLongDescription, question) => {
    if (!question.trim()) {
      setSpecificServiceAnswer('Vui lòng nhập câu hỏi của bạn.');
      return;
    }

    setIsAskingSpecificService(true);
    setSpecificServiceAnswer(null); // Clear previous answer

    const llmPrompt = `Dựa trên mô tả dịch vụ sau, hãy trả lời câu hỏi của người dùng. Nếu thông tin không có trong mô tả, hãy nói rõ rằng bạn không tìm thấy thông tin này trong văn bản cung cấp.

    Mô tả dịch vụ:
    "${serviceLongDescription}"

    Câu hỏi của người dùng: "${question}"

    Trả lời:
    `;

    try {
      const payload = {
        contents: [{ role: "user", parts: [{ text: llmPrompt }] }],
        generationConfig: {
          temperature: 0.2, // Keep it less creative, more factual and constrained
          topP: 0.8,
          topK: 10,
        },
      };

      const apiKey = "";
      const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const result = await response.json();
      if (result.candidates && result.candidates.length > 0 &&
          result.candidates[0].content && result.candidates[0].content.parts &&
          result.candidates[0].content.parts.length > 0) {
        const text = result.candidates[0].content.parts[0].text;
        setSpecificServiceAnswer(text);
      } else {
        setSpecificServiceAnswer('Không thể trả lời câu hỏi của bạn lúc này. Vui lòng thử lại.');
      }
    } catch (error) {
      console.error('Error calling Gemini API for specific service question:', error);
      setSpecificServiceAnswer('Đã xảy ra lỗi khi xử lý câu hỏi. Vui lòng thử lại.');
    } finally {
      setIsAskingSpecificService(false);
    }
  };


  const handleCategoryChange = (category) => {
    setIsLoading(true);
    setSearchTerm('');
    setSelectedService(null);
    setIsNavOpen(false);
    setGeneratedServiceBenefits(null); // Clear benefits
    setIsGeneratingBenefits(false); // Reset loading state
    setSpecificServiceQuestion(''); // Clear specific question input
    setSpecificServiceAnswer(null); // Clear specific answer
    setIsAskingSpecificService(false); // Reset specific question loading state
    setTimeout(() => {
      setActiveCategory(category);
      setIsLoading(false);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }, 500);
  };

  const handleSearchChange = (e) => {
    setSearchTerm(e.target.value);
    setSelectedService(null);
    setGeneratedServiceBenefits(null); // Clear benefits
    setIsGeneratingBenefits(false); // Reset loading state
    setSpecificServiceQuestion(''); // Clear specific question input
    setSpecificServiceAnswer(null); // Clear specific answer
    setIsAskingSpecificService(false); // Reset specific question loading state
  };

  useEffect(() => {
    const toggleVisibility = () => {
      if (window.pageYOffset > 300) {
        setShowScrollToTop(true);
      } else {
        setShowScrollToTop(false);
      }
    };

    window.addEventListener('scroll', toggleVisibility);
    return () => window.removeEventListener('scroll', toggleVisibility);
  }, []);

  const scrollToTop = () => {
    window.scrollTo({
      top: 0,
      behavior: 'smooth'
    });
  };

  const toggleFaq = (id) => {
    setOpenFaqId(openFaqId === id ? null : id);
  };

  const handleContactSubmit = async (e) => {
    e.preventDefault();
    setFormFeedback('');

    if (!db || !userId) {
      setFormFeedback('Lỗi: Hệ thống chưa sẵn sàng. Vui lòng thử lại sau.');
      return;
    }

    if (!contactName || !contactEmail || !contactMessage) {
      setFormFeedback('Vui lòng điền đầy đủ Họ và Tên, Email, và Tin nhắn.');
      return;
    }

    try {
      await addDoc(collection(db, `artifacts/${__app_id}/public/data/contact_forms`), {
        userId: userId,
        name: contactName,
        email: contactEmail,
        phone: contactPhone,
        message: contactMessage,
        timestamp: serverTimestamp(),
      });
      setFormFeedback('Yêu cầu của bạn đã được gửi thành công! Chúng tôi sẽ liên hệ lại sớm nhất.');
      setContactName('');
      setContactEmail('');
      setContactPhone('');
      setContactMessage('');
    } catch (error) {
      console.error("Error submitting contact form: ", error);
      setFormFeedback('Đã xảy ra lỗi khi gửi yêu cầu. Vui lòng thử lại.');
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 font-sans relative text-gray-800">
      {/* Global User ID Display */}
      {userId && (
        <div className="fixed top-0 left-0 bg-blue-800 text-white text-xs px-2 py-1 rounded-br-lg z-50">
          User ID: {userId}
        </div>
      )}

      {/* Hero Section */}
      <section
        className="relative h-screen flex flex-col items-center justify-center text-white text-center p-4 bg-gradient-to-br from-indigo-700 to-purple-900 overflow-hidden"
      >
        <div className="absolute inset-0 z-0 opacity-20" style={{ backgroundImage: `url('https://www.transparenttextures.com/patterns/cubes.png')` }}></div>
        <div className="relative z-10 animate-fadeIn duration-1000">
          <h1 className="text-6xl md:text-7xl font-extrabold mb-6 drop-shadow-lg leading-tight">
            Giải Pháp Toàn Diện Cho Tương Lai Của Bạn
          </h1>
          <p className="text-xl md:text-2xl mb-10 opacity-90 max-w-3xl mx-auto">
            Chúng tôi cung cấp các dịch vụ tài chính và công nghệ tiên tiến để hỗ trợ cá nhân và doanh nghiệp phát triển bền vững.
          </p>
          <button
            onClick={() => window.location.href = '#contact-form'}
            className="px-10 py-4 bg-white text-indigo-700 font-bold text-lg rounded-full shadow-xl hover:bg-gray-100 transition duration-300 transform hover:scale-105 animate-bounce-slow"
          >
            Liên Hệ Ngay
          </button>
        </div>
      </section>

      {/* About Us section */}
      <section className="container mx-auto bg-white rounded-2xl shadow-xl p-8 mb-12 -mt-16 relative z-20 transform transition-all duration-500 hover:scale-[1.01]">
        <h2 className="text-4xl font-bold text-center mb-6 text-indigo-700">Về Chúng Tôi</h2>
        <div className="flex flex-col md:flex-row items-center gap-8">
          <div className="md:w-1/2">
            <img
              src="https://placehold.co/600x400/9ca3af/ffffff?text=Our+Team"
              alt="Đội ngũ của chúng tôi"
              className="rounded-xl shadow-lg w-full h-auto object-cover"
              onError={(e) => { e.target.onerror = null; e.target.src='https://placehold.co/600x400/cccccc/333333?text=Anh+Gioi+Thieu'; }}
            />
          </div>
          <div className="md:w-1/2 text-left">
            <p className="text-lg leading-relaxed mb-4 text-gray-700">
              Chúng tôi là một đội ngũ chuyên nghiệp, tận tâm mang đến những giải pháp tài chính và công nghệ tiên tiến, toàn diện nhất cho khách hàng tại Việt Nam. Với nhiều năm kinh nghiệm, chúng tôi tự hào là đối tác đáng tin cậy, luôn lắng nghe và đáp ứng mọi nhu cầu của bạn, từ giải pháp kinh doanh, dịch vụ tài chính cá nhân đến các thiết bị công nghệ hiện đại.
            </p>
            <p className="text-lg leading-relaxed text-gray-700">
              Mục tiêu của chúng tôi là giúp bạn đạt được hiệu quả tối đa trong công việc và cuộc sống, thông qua các sản phẩm và dịch vụ chất lượng cao cùng sự hỗ trợ chuyên nghiệp, nhanh chóng. Chúng tôi không ngừng cải tiến để mang lại giá trị vượt trội.
            </p>
          </div>
        </div>
      </section>

      {/* Search Bar */}
      <div className="container mx-auto mb-8 px-4">
        <input
          type="text"
          placeholder="Tìm kiếm dịch vụ..."
          className="w-full p-4 rounded-xl shadow-md border border-gray-200 focus:outline-none focus:ring-4 focus:ring-indigo-300 transition duration-300 text-lg"
          value={searchTerm}
          onChange={handleSearchChange}
          aria-label="Tìm kiếm dịch vụ"
        />
      </div>

      {/* Navigation Bar for categories (Responsive with Hamburger) */}
      <nav className="container mx-auto bg-white rounded-2xl shadow-xl p-4 mb-12">
        <div className="md:hidden flex justify-end">
          <button
            onClick={() => setIsNavOpen(!isNavOpen)}
            className="p-2 text-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 rounded-md"
            aria-label="Mở/đóng menu điều hướng"
          >
            <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d={isNavOpen ? "M6 18L18 6M6 6l12 12" : "M4 6h16M4 12h16M4 18h16"}></path>
            </svg>
          </button>
        </div>

        <ul className={`flex flex-wrap justify-center gap-3 md:flex ${isNavOpen ? 'flex flex-col mt-4' : 'hidden'}`}>
          {categories.map((category, index) => (
            <li key={index} className={isNavOpen ? 'w-full text-center' : ''}>
              <button
                onClick={() => handleCategoryChange(category)}
                className={`
                  px-6 py-3 rounded-full text-base font-semibold w-full
                  transition-all duration-300 ease-in-out
                  ${activeCategory === category
                    ? 'bg-gradient-to-r from-indigo-600 to-purple-700 text-white shadow-lg transform scale-105'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200 hover:text-indigo-700'
                  }
                  focus:outline-none focus:ring-4 focus:ring-indigo-300 focus:ring-opacity-75
                `}
                aria-current={activeCategory === category ? 'page' : undefined}
              >
                {category}
              </button>
            </li>
          ))}
        </ul>
      </nav>

      {/* Main content area */}
      <main className="container mx-auto px-4">
        {/* Category Banner Image */}
        {activeCategory && categoryBannerImages[activeCategory] && (
          <div className="w-full h-64 md:h-80 lg:h-96 mb-12 rounded-2xl overflow-hidden shadow-xl">
            <img
              src={categoryBannerImages[activeCategory]}
              alt={`Banner cho danh mục ${activeCategory}`}
              className="w-full h-full object-cover object-center animate-fadeZoom"
              onError={(e) => {
                e.target.onerror = null;
                e.target.src = `https://placehold.co/1920x600/cccccc/333333?text=Không+Tải+Được+Ảnh`;
              }}
            />
          </div>
        )}

        {/* Loading Spinner */}
        {isLoading ? (
          <div className="flex justify-center items-center h-64">
            <div className="animate-spin rounded-full h-20 w-20 border-t-4 border-b-4 border-indigo-500"></div>
          </div>
        ) : (
          /* Services grid displaying filtered services */
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8">
            {filteredServices.length > 0 ? (
              filteredServices.map((service) => (
                <div
                  key={service.id}
                  onClick={() => openServiceModal(service)}
                  className="bg-white rounded-2xl shadow-xl hover:shadow-2xl transform hover:-translate-y-2 transition duration-300 ease-in-out overflow-hidden flex flex-col cursor-pointer border border-gray-100"
                >
                  {/* Service Image */}
                  <div className="w-full h-56 md:h-64 overflow-hidden rounded-t-2xl bg-gray-200">
                    <img
                      src={service.imageUrl}
                      alt={service.name}
                      className="w-full h-full object-cover transition-transform duration-300 hover:scale-110"
                      onError={(e) => {
                        e.target.onerror = null;
                        e.target.src = `https://placehold.co/600x400/cccccc/333333?text=${encodeURIComponent(service.name)}`;
                      }}
                    />
                  </div>
                  {/* Service Content */}
                  <div className="p-6 flex-grow flex flex-col justify-between">
                    <h2 className="text-2xl font-bold text-gray-900 mb-3">{service.name}</h2>
                    <p className="text-gray-600 leading-relaxed flex-grow text-base">{service.description}</p>
                    <button
                      onClick={(e) => { e.stopPropagation(); openServiceModal(service); }}
                      className="mt-6 px-6 py-3 bg-gradient-to-r from-indigo-600 to-purple-700 text-white rounded-full hover:from-indigo-700 hover:to-purple-800 transition-all duration-300 shadow-lg self-start text-base font-semibold"
                      aria-label={`Xem chi tiết dịch vụ ${service.name}`}
                    >
                      Xem chi tiết
                    </button>
                  </div>
                </div>
              ))
            ) : (
              <p className="col-span-full text-center text-xl text-gray-600 py-10">Không tìm thấy dịch vụ nào phù hợp với tìm kiếm của bạn.</p>
            )}
          </div>
        )}
      </main>

      {/* Our Process Section */}
      <section className="container mx-auto bg-white rounded-2xl shadow-xl p-8 mt-16 mb-12 text-center px-4">
        <h2 className="text-4xl font-bold text-indigo-700 mb-10">Quy Trình Làm Việc Của Chúng Tôi</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {processSteps.map((step) => (
            <div key={step.id} className="flex flex-col items-center p-4 rounded-xl transition-transform duration-300 hover:scale-105">
              <div className="w-20 h-20 bg-indigo-500 text-white rounded-full flex items-center justify-center text-3xl font-extrabold mb-5 shadow-md">
                {step.id.replace('step', '')}
              </div>
              <h3 className="text-2xl font-semibold text-gray-900 mb-3">{step.title}</h3>
              <p className="text-gray-700 leading-relaxed text-base">{step.description}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Testimonials Section (Now fetches from Firestore) */}
      <section className="bg-gradient-to-r from-indigo-600 to-purple-700 text-white p-8 mt-16 mb-12 relative overflow-hidden">
        <div className="container mx-auto relative z-10 px-4">
          <h2 className="text-4xl font-bold text-center mb-10">Khách Hàng Nói Gì Về Chúng Tôi</h2>
          {testimonials.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
              {testimonials.map((testimonial) => (
                <div key={testimonial.id} className="bg-white text-gray-800 p-6 rounded-xl shadow-lg flex flex-col justify-between border-b-4 border-indigo-300 transform transition-transform duration-300 hover:scale-[1.02]">
                  <p className="italic text-lg mb-4 leading-relaxed">"{testimonial.quote}"</p>
                  <div>
                    <p className="font-bold text-indigo-700 text-lg">{testimonial.customerName}</p>
                    <p className="text-sm text-gray-600">{testimonial.title}</p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-center text-white opacity-80 text-xl py-10">Đang tải đánh giá khách hàng...</p>
          )}
        </div>
        <div className="absolute top-0 left-0 w-full h-full opacity-10 z-0" style={{ backgroundImage: `url('https://www.transparenttextures.com/patterns/lined-paper.png')` }}></div>
      </section>

      {/* FAQ Section */}
      <section className="container mx-auto bg-white rounded-2xl shadow-xl p-8 mt-16 mb-12 px-4">
        <h2 className="text-4xl font-bold text-indigo-700 text-center mb-10">Câu Hỏi Thường Gặp</h2>
        <div className="space-y-4 max-w-3xl mx-auto">
          {faqs.map((faq) => (
            <div key={faq.id} className="border border-gray-200 rounded-lg overflow-hidden shadow-sm transition-all duration-300 hover:shadow-md">
              <button
                className="flex justify-between items-center w-full p-5 text-left font-semibold text-xl text-gray-800 bg-gray-50 hover:bg-gray-100 transition-colors duration-200 focus:outline-none"
                onClick={() => toggleFaq(faq.id)}
                aria-expanded={openFaqId === faq.id ? 'true' : 'false'}
                aria-controls={`faq-answer-${faq.id}`}
              >
                <span>{faq.question}</span>
                <svg
                  className={`w-6 h-6 transition-transform duration-200 ${openFaqId === faq.id ? 'rotate-180 text-indigo-600' : 'text-gray-500'}`}
                  fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path>
                </svg>
              </button>
              {openFaqId === faq.id && (
                <div id={`faq-answer-${faq.id}`} role="region" className="p-5 bg-white border-t border-gray-200 animate-fadeInContent">
                  <p className="text-gray-700 text-lg">{faq.answer}</p>
                </div>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* Contact Form Section */}
      <section id="contact-form" className="container mx-auto bg-white rounded-2xl shadow-xl p-8 mt-16 mb-12 px-4">
        <h2 className="text-4xl font-bold text-indigo-700 text-center mb-10">Gửi Yêu Cầu Liên Hệ</h2>
        <form onSubmit={handleContactSubmit} className="max-w-xl mx-auto space-y-6">
          <div>
            <label htmlFor="contactName" className="block text-gray-700 text-lg font-semibold mb-2">
              Họ và Tên:
            </label>
            <input
              type="text"
              id="contactName"
              name="name"
              className="w-full p-3 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 text-lg transition duration-200"
              placeholder="Nhập họ và tên của bạn"
              value={contactName}
              onChange={(e) => setContactName(e.target.value)}
              required
            />
          </div>
          <div>
            <label htmlFor="contactEmail" className="block text-gray-700 text-lg font-semibold mb-2">
              Email:
            </label>
            <input
              type="email"
              id="contactEmail"
              name="email"
              className="w-full p-3 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 text-lg transition duration-200"
              placeholder="Nhập email của bạn"
              value={contactEmail}
              onChange={(e) => setContactEmail(e.target.value)}
              required
            />
          </div>
          <div>
            <label htmlFor="contactPhone" className="block text-gray-700 text-lg font-semibold mb-2">
              Số điện thoại:
            </label>
            <input
              type="tel"
              id="contactPhone"
              name="phone"
              className="w-full p-3 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 text-lg transition duration-200"
              placeholder="Nhập số điện thoại của bạn (tùy chọn)"
              value={contactPhone}
              onChange={(e) => setContactPhone(e.target.value)}
            />
          </div>
          <div>
            <label htmlFor="contactMessage" className="block text-gray-700 text-lg font-semibold mb-2">
              Tin nhắn:
            </label>
            <textarea
              id="contactMessage"
              name="message"
              rows="6"
              className="w-full p-3 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 text-lg transition duration-200"
              placeholder="Nội dung bạn muốn liên hệ..."
              value={contactMessage}
              onChange={(e) => setContactMessage(e.target.value)}
              required
            ></textarea>
          </div>
          {formFeedback && (
            <p className={`text-center font-semibold text-lg ${formFeedback.includes('thành công') ? 'text-green-600' : 'text-red-600'}`}>
              {formFeedback}
            </p>
          )}
          <div className="text-center">
            <button
              type="submit"
              className="px-8 py-4 bg-gradient-to-r from-indigo-600 to-purple-700 text-white font-bold text-lg rounded-full shadow-lg hover:from-indigo-700 hover:to-purple-800 transition-all duration-300 transform hover:scale-105"
              disabled={!isAuthReady}
            >
              Gửi Yêu Cầu
            </button>
          </div>
        </form>
      </section>

      {/* Service Detail Modal (Updated with Key Benefits Generator and Ask AI) */}
      {selectedService && (
        <div className="fixed inset-0 bg-black bg-opacity-80 flex items-center justify-center p-4 z-50 animate-fadeIn overflow-auto">
          <div className="bg-white rounded-2xl shadow-2xl max-w-3xl w-full p-8 relative animate-scaleIn transform scale-100 opacity-100">
            <button
              onClick={closeServiceModal}
              className="absolute top-4 right-4 text-gray-500 hover:text-gray-900 text-4xl font-bold transition-colors duration-200"
              aria-label="Đóng"
            >
              &times;
            </button>
            <h2 className="text-4xl font-bold text-gray-900 mb-6 text-center">{selectedService.name}</h2>
            <div className="mb-6 rounded-lg overflow-hidden shadow-lg border border-gray-200">
              <img
                src={selectedService.imageUrl}
                alt={selectedService.name}
                className="w-full h-auto object-cover max-h-96"
                onError={(e) => {
                  e.target.onerror = null;
                  e.target.src = `https://placehold.co/800x600/cccccc/333333?text=${encodeURIComponent(selectedService.name)}`;
                }}
              />
            </div>
            <p className="text-gray-700 text-lg leading-relaxed mb-8">{selectedService.longDescription}</p>

            {/* AI Generate Key Benefits Button */}
            <div className="text-center mb-8">
              <button
                onClick={() => generateKeyBenefits(selectedService.longDescription)}
                className="inline-flex items-center px-6 py-3 bg-blue-500 text-white font-bold rounded-full shadow-lg hover:bg-blue-600 transition-colors duration-200 text-lg transform hover:scale-105"
                disabled={isGeneratingBenefits}
              >
                {isGeneratingBenefits ? (
                  <>
                    <div className="animate-spin rounded-full h-5 w-5 border-t-2 border-b-2 border-white mr-2"></div>
                    Đang tạo...
                  </>
                ) : (
                  <>
                    <svg className="w-6 h-6 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2-2m2 2l-2-2m-2 18l2 2m2-2l-2 2M8 9h8v6H8V9z"></path>
                    </svg>
                    ✨ Gợi ý Lợi ích chính ✨
                  </>
                )}
              </button>
            </div>

            {/* Display Generated Benefits */}
            {generatedServiceBenefits && (
              <div className="bg-gray-100 p-6 rounded-lg mb-8 shadow-inner animate-fadeInContent">
                <h3 className="text-2xl font-bold text-gray-900 mb-3">Lợi ích chính:</h3>
                <div className="prose max-w-none text-gray-700" dangerouslySetInnerHTML={{ __html: generatedServiceBenefits.replace(/\n/g, '<br/>') }}></div>
              </div>
            )}

            {/* Ask AI about this Service Section */}
            <div className="bg-gray-50 p-6 rounded-lg mb-8 shadow-md">
              <h3 className="text-2xl font-bold text-gray-900 mb-4 text-center">Hỏi AI về dịch vụ này ✨</h3>
              <input
                type="text"
                className="w-full p-3 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 text-lg mb-4"
                placeholder="Ví dụ: 'Dịch vụ này có hỗ trợ trả góp không?'"
                value={specificServiceQuestion}
                onChange={(e) => setSpecificServiceQuestion(e.target.value)}
                onKeyPress={(e) => { if (e.key === 'Enter') askAboutSpecificService(selectedService.longDescription, specificServiceQuestion); }}
                disabled={isAskingSpecificService}
              />
              <div className="text-center mb-4">
                <button
                  onClick={() => askAboutSpecificService(selectedService.longDescription, specificServiceQuestion)}
                  className="inline-flex items-center px-6 py-3 bg-green-500 text-white font-bold rounded-full shadow-lg hover:bg-green-600 transition-colors duration-200 text-lg transform hover:scale-105"
                  disabled={isAskingSpecificService || !specificServiceQuestion.trim()}
                >
                  {isAskingSpecificService ? (
                    <>
                      <div className="animate-spin rounded-full h-5 w-5 border-t-2 border-b-2 border-white mr-2"></div>
                      Đang hỏi...
                    </>
                  ) : (
                    <>
                      <svg className="w-6 h-6 mr-2" fill="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z"></path>
                      </svg>
                      Hỏi AI
                    </>
                  )}
                </button>
              </div>
              {specificServiceAnswer && (
                <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200 animate-fadeInContent">
                  <h4 className="text-xl font-bold text-gray-900 mb-2">Trả lời từ AI:</h4>
                  <p className="text-gray-700 text-lg">{specificServiceAnswer}</p>
                </div>
              )}
            </div>

            <div className="flex justify-center flex-wrap gap-4">
              <a
                href="tel:0363798989"
                className="inline-flex items-center px-8 py-4 bg-green-600 text-white font-bold rounded-full shadow-lg hover:bg-green-700 transition-colors duration-200 text-lg transform hover:scale-105"
              >
                <svg className="w-6 h-6 mr-3" fill="currentColor" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg">
                  <path d="M2 3a1 1 0 011-1h2.153a1 1 0 01.986.836l.74 4.435a1 1 0 01-.54 1.06l-1.548.773a11.037 11.037 0 006.105 6.105l.774-1.548a1 1 0 011.059-.54l4.435.74a1 1 0 01.836.986V17a1 1 0 01-1 1h-2C7.82 18 2 12.18 2 5V3z"></path>
                </svg>
                Gọi Ngay Tư Vấn
              </a>
              <button
                onClick={closeServiceModal}
                className="inline-flex items-center px-8 py-4 bg-gray-200 text-gray-800 font-bold rounded-full shadow-lg hover:bg-gray-300 transition-colors duration-200 text-lg transform hover:scale-105"
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}

      {/* AI Chat Assistant Modal */}
      <AIChatAssistantModal
        isOpen={isAIChatOpen}
        onClose={() => setIsAIChatOpen(false)}
        services={services}
      />

      {/* Service Comparison Modal */}
      <ServiceComparisonModal
        isOpen={isComparisonModalOpen}
        onClose={() => setIsComparisonModalOpen(false)}
        services={services}
      />

      {/* Floating AI Assistant Button */}
      <button
        onClick={() => setIsAIChatOpen(true)}
        className="fixed bottom-8 left-8 bg-blue-600 text-white p-4 rounded-full shadow-xl hover:bg-blue-700 focus:outline-none focus:ring-4 focus:ring-blue-300 transition-all duration-300 z-40 transform hover:scale-110 flex items-center justify-center text-lg font-semibold"
        title="Trợ lý AI"
      >
        <svg className="w-7 h-7 mr-2" fill="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
          <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zM8 12c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm4 0c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm4 0c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2z"></path>
        </svg>
        Trợ lý AI ✨
      </button>

      {/* Floating Service Comparison Button */}
      <button
        onClick={() => setIsComparisonModalOpen(true)}
        className="fixed bottom-8 left-1/2 -translate-x-1/2 bg-purple-600 text-white p-4 rounded-full shadow-xl hover:bg-purple-700 focus:outline-none focus:ring-4 focus:ring-purple-300 transition-all duration-300 z-40 transform hover:scale-110 flex items-center justify-center text-lg font-semibold"
        title="So sánh Dịch vụ"
      >
        <svg className="w-7 h-7 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4"></path>
        </svg>
        So sánh Dịch vụ ✨
      </button>

      {/* "Back to Top" button */}
      {showScrollToTop && (
        <button
          onClick={scrollToTop}
          className="fixed bottom-8 right-8 bg-indigo-600 text-white p-4 rounded-full shadow-xl hover:bg-indigo-700 focus:outline-none focus:ring-4 focus:ring-indigo-300 transition-opacity duration-300 z-40 transform hover:scale-110"
          title="Cuộn lên đầu trang"
        >
          <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 10l7-7m0 0l7 7m-7-7v18"></path>
          </svg>
        </button>
      )}

      {/* Contact information section */}
      <footer className="container mx-auto text-center py-12 mt-16 bg-gradient-to-r from-indigo-700 to-purple-800 text-white rounded-2xl shadow-xl px-4">
        <h3 className="text-4xl font-bold mb-6">Liên Hệ Ngay Để Được Tư Vấn!</h3>
        <p className="text-xl mb-3">
          📞 Điện thoại: <a href="tel:0363798989" className="underline font-semibold hover:text-blue-200 transition-colors duration-200">0363.79.89.89</a>
        </p>
        <p className="text-xl mb-8">
          👤 Người liên hệ: <span className="font-semibold">Hiếu</span>
        </p>
        <div className="flex justify-center space-x-8 mt-6">
          <a href="https://facebook.com" target="_blank" rel="noopener noreferrer" className="text-white hover:text-blue-200 transition-colors duration-200 transform hover:scale-110" aria-label="Truy cập trang Facebook của chúng tôi">
            <svg fill="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" className="w-10 h-10" viewBox="0 0 24 24">
              <path d="M18 2h-3a5 5 0 00-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 011-1h3z"></path>
            </svg>
          </a>
          <a href="https://zalo.me/0363798989" target="_blank" rel="noopener noreferrer" className="text-white hover:text-blue-200 transition-colors duration-200 transform hover:scale-110" aria-label="Nhắn tin cho chúng tôi qua Zalo">
            <svg fill="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="0" className="w-10 h-10" viewBox="0 0 24 24">
                <path d="M12.001 0C5.373 0 0 5.373 0 12.001C0 18.628 5.373 24 12.001 24C18.628 24 24 18.628 24 12.001C24 5.373 18.628 0 12.001 0ZM12 1.83C17.618 1.83 22.17 6.382 22.17 12C22.17 17.618 17.618 22.17 12 22.17C6.382 22.17 1.83 17.618 1.83 12C1.83 6.382 6.382 1.83 12 1.83ZM16.035 16.536C15.696 16.874 15.289 17.065 14.882 17.065C14.475 17.065 14.068 16.874 13.729 16.536L12 14.807L10.271 16.536C9.932 16.874 9.525 17.065 9.118 17.065C8.711 17.065 8.304 16.874 7.965 16.536C7.288 15.859 7.288 14.752 7.965 14.075L9.694 12.346L7.965 10.617C7.288 9.94 7.288 8.833 7.965 8.156C8.642 7.479 9.749 7.479 10.426 8.156L12 9.885L13.574 8.156C14.251 7.479 15.358 7.479 16.035 8.156C16.712 8.833 16.712 9.94 16.035 10.617L14.306 12.346L16.035 14.075C16.712 14.752 16.712 15.859 16.035 16.536Z"></path>
            </svg>
          </a>
        </div>
        <p className="text-lg mt-4 opacity-80">
          Chúng tôi luôn sẵn lòng lắng nghe và hỗ trợ bạn.
        </p>
      </footer>
    </div>
  );
};

export default App;
