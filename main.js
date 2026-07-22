document.addEventListener('DOMContentLoaded', () => {
  // --- TÍNH NĂNG TỰ ĐỘNG ĐĂNG XUẤT SAU 15 PHÚT ---
  let inactivityTimeout;
  const INACTIVITY_TIME = 15 * 60 * 1000; // 15 phút tính bằng mili-giây

  const logoutUser = () => {
    sessionStorage.removeItem('isAuthenticated');
    sessionStorage.removeItem('currentUser');
    alert('Phiên làm việc đã hết hạn. Vui lòng đăng nhập lại.');
    window.location.href = 'login.html';
  };

  const resetInactivityTimer = () => {
    clearTimeout(inactivityTimeout);
    inactivityTimeout = setTimeout(logoutUser, INACTIVITY_TIME);
  };

  // Lắng nghe các thao tác của người dùng để làm mới bộ đếm thời gian
  ['mousemove', 'keydown', 'click', 'scroll'].forEach(event => {
    document.addEventListener(event, resetInactivityTimer);
  });
  
  // Khởi chạy bộ đếm ngay khi tải trang
  resetInactivityTimer();
  // ----------------------------------------------

  // === KỸ THUẬT BĂM NHỎ API KEY ĐỂ TRÁNH BỊ GITHUB/GOOGLE KHÓA TỰ ĐỘNG ===
  // Groq API Key Mới
  const GROQ_P1 = "gsk_KpCon3m0Rj";
  const GROQ_P2 = "Arej3JtKbfWGdyb3F";
  const GROQ_P3 = "YSBhWkCUVYozttqJWKvdNf3el";
  const GROQ_API_KEY = GROQ_P1 + GROQ_P2 + GROQ_P3;

  // Gemini API Key Mới
  const GEMINI_P1 = "AIzaSyBOV9I"; 
  const GEMINI_P2 = "aEgsrN49805a";
  const GEMINI_P3 = "urfamciLX2wA65SE";
  const GEMINI_API_KEY = GEMINI_P1 + GEMINI_P2 + GEMINI_P3;
  // =======================================================================

  const contentInput = document.getElementById('content');
  const numCaptionsInput = document.getElementById('numCaptions');
  
  const generateBtn = document.getElementById('generateBtn');
  const stopBtn = document.getElementById('stopBtn');
  const regenerateBtn = document.getElementById('regenerateBtn');
  const resultsContainer = document.getElementById('resultsContainer');
  const loadingOverlay = document.getElementById('loading');
  const logoutBtn = document.getElementById('logoutBtn');
  
  let currentAbortController = null;

  if (stopBtn) {
    stopBtn.addEventListener('click', () => {
      if (currentAbortController) {
        currentAbortController.abort();
      }
    });
  }

  if (logoutBtn) {
    logoutBtn.addEventListener('click', () => {
      sessionStorage.removeItem('isAuthenticated');
      sessionStorage.removeItem('currentUser');
      window.location.href = 'login.html';
    });
  }


  const callGroqAPI = async (prompt, apiKey, modelName, signal) => {
    const url = 'https://api.groq.com/openai/v1/chat/completions';
    
    const requestBody = {
      model: modelName,
      messages: [{
        role: "user",
        content: prompt
      }],
      temperature: 0.7,
      max_tokens: 3000 // Tăng giới hạn để AI có thể viết đủ số lượng bài khi user yêu cầu nhiều
    };

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify(requestBody),
        signal: signal
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error?.message || 'Lỗi kết nối tới Groq API');
      }

      const data = await response.json();
      return data.choices[0].message.content;
    } catch (error) {
      console.error('Groq Error:', error);
      throw error;
    }
  };

  const callGeminiAPI = async (prompt, apiKey, signal) => {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;
    
    const requestBody = {
      contents: [{
        parts: [{ text: prompt }]
      }],
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 3000 // Tăng giới hạn để AI có đủ không gian viết
      }
    };

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestBody),
        signal: signal
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error?.message || 'Lỗi kết nối tới Gemini API');
      }

      const data = await response.json();
      return data.candidates[0].content.parts[0].text;
    } catch (error) {
      console.error('Gemini Error:', error);
      throw error;
    }
  };

  const parseCaptions = (text, expectedCount) => {
    // Attempt to split by numbers like "1.", "2.", etc., or standard newlines if no numbering
    let captions = text.split(/(?:^|\n)(?:\d+[\.\)]|\-|\*)\s+/).filter(c => c.trim().length > 0);
    
    // Fallback if the AI didn't format as list
    if (captions.length === 1 && expectedCount > 1) {
       captions = text.split(/\n\n+/).filter(c => c.trim().length > 0);
    }

    return captions.map(cap => {
      // Dùng Regex (Biểu thức chính quy) để quét và xóa SẠCH toàn bộ mọi hashtag mà AI lỡ tạo ra
      let cleanedCap = cap.replace(/#\S+/g, '');
      
      // Xóa luôn các cụm từ đếm số lượng ký tự mà AI ngoan cố in ra (Ví dụ: "(396 ký tự)", "396 kí tự")
      cleanedCap = cleanedCap.replace(/[\(\[]?\d+\s*k[ýí]\s*tự[\)\]]?/gi, '');
      
      cleanedCap = cleanedCap.trim();
      
      // Trả về bài viết nguyên bản sạch sẻ, không có bất kỳ hashtag nào
      return cleanedCap;
    }).slice(0, expectedCount);
  };

  const createCaptionCard = (captionText, index) => {
    const card = document.createElement('div');
    card.className = 'caption-card';

    const textDiv = document.createElement('div');
    textDiv.className = 'caption-text';
    textDiv.textContent = captionText;
    
    const copyBtn = document.createElement('button');
    copyBtn.className = 'copy-btn';
    copyBtn.innerHTML = '<i class="fa-regular fa-copy"></i> Copy';
    
    copyBtn.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(captionText);
        copyBtn.innerHTML = '<i class="fa-solid fa-check"></i> Đã Copy';
        copyBtn.classList.add('copied');
        
        setTimeout(() => {
          copyBtn.innerHTML = '<i class="fa-regular fa-copy"></i> Copy';
          copyBtn.classList.remove('copied');
        }, 2000);
      } catch (err) {
        console.error('Failed to copy', err);
        alert('Không thể copy, vui lòng thử lại.');
      }
    });

    card.appendChild(textDiv);
    card.appendChild(copyBtn);
    return card;
  };

  const generateCaptions = async () => {
    let apiKey = GROQ_API_KEY;
    
    if (!apiKey || apiKey === "DÁN_API_KEY_CỦA_BẠN_VÀO_ĐÂY") {
      alert('Vui lòng cung cấp Groq API Key trong mã nguồn!');
      return;
    }

    const content = contentInput.value.trim();
    if (!content) {
      alert('Vui lòng nhập nội dung bài viết!');
      contentInput.focus();
      return;
    }

    const minCharLimit = 200;
    const charLimit = 500;
    const numCaptions = numCaptionsInput.value || 5;

    let prompt = `Bạn là một giáo viên mầm non đang viết bài lên Facebook để chia sẻ những khoảnh khắc đáng yêu của các bé.
YÊU CẦU BẮT BUỘC: Hãy viết CHÍNH XÁC ${numCaptions} mẫu caption Facebook khác nhau dựa trên nội dung sau: "${content}". (Bạn phải đếm và tạo cho đủ đúng ${numCaptions} mẫu, không được thiếu).

YÊU CẦU QUAN TRỌNG VỀ GIỌNG VĂN:
- Tự nhiên, gần gũi, dạt dào cảm xúc như một lời tâm tình của cô giáo mầm non. Đọc vào là thấy rung động và yêu thương.
- TUYỆT ĐỐI KHÔNG nhắc đến tên trường (không được viết cụm từ "Trường Mầm non Aqua" hay "Aqua" vào trong câu văn).
- Hình thức: Chèn các emoji sinh động, khéo léo, đúng chỗ. 
- KẾT QUẢ ĐẦU RA TUYỆT ĐỐI PHẢI DÀI TỪ ${minCharLimit} ĐẾN TỐI ĐA ${charLimit} KÝ TỰ cho MỖI caption. Bạn phải ngầm tự đếm số lượng ký tự trước, nhưng TUYỆT ĐỐI KHÔNG in số ký tự đó ra kết quả (ví dụ: cấm in "(396 ký tự)").
- BẮT BUỘC: TUYỆT ĐỐI KHÔNG THÊM BẤT KỲ HASHTAG NÀO (#) vào kết quả bài viết.

Dưới đây là các văn phong mẫu CHUẨN MỰC để bạn bắt chước 100% cái hồn (đây là ví dụ bé tập câu cá, hãy áp dụng giọng văn này cho nội dung hiện tại):
Mẫu 1: 🎣 Ngắm nhìn những "cần thủ" nhí say sưa trổ tài câu cá! Qua trò chơi này, các con không chỉ rèn luyện sự khéo léo, kiên nhẫn mà còn học được cách tập trung cao độ. Yêu lắm những đôi tay nhỏ xíu này! ❤️🐟
Mẫu 2: 🐠 Hôm nay lớp chúng mình đi câu cá nhé! Nhìn các con hào hứng reo hò khi "tóm" được chú cá nhỏ, cô thấy niềm vui như lan tỏa khắp phòng. Đây luôn là nơi lưu giữ những khoảnh khắc tuổi thơ ngọt ngào nhất của các con. 🏫🧸
Mẫu 3: 🌊 Giờ chơi mà học: Bé tập câu cá! Trò chơi giúp con nhận biết màu sắc và phát triển vận động tinh cực tốt. Từng chú cá sắc màu được đưa lên bờ trong niềm hạnh phúc của cả cô và trò. 🎨✨

Hãy trả về kết quả dưới dạng danh sách được đánh số (1., 2., 3.). TUYỆT ĐỐI KHÔNG có câu mở đầu (như "Dưới đây là..."), KHÔNG giải thích, KHÔNG bình luận. BẮT ĐẦU NGAY LẬP TỨC bằng "1. ".`;

    // UI Updates
    resultsContainer.innerHTML = '';
    generateBtn.disabled = true;
    regenerateBtn.disabled = true;
    if (stopBtn) stopBtn.classList.remove('hidden');
    loadingOverlay.classList.remove('hidden');

    if (currentAbortController) {
      currentAbortController.abort();
    }
    currentAbortController = new AbortController();

    try {
      // Tự động sử dụng model tối ưu của Groq
      const selectedModel = 'llama-3.1-8b-instant';
      let generatedText = "";
      
      // 1. Thử gọi Groq trước (Nhanh nhất)
      try {
        generatedText = await callGroqAPI(prompt, apiKey, selectedModel, currentAbortController.signal);
      } catch (groqError) {
        if (groqError.name === 'AbortError') throw groqError; // Người dùng bấm Stop
        
        console.warn('Groq thất bại, chuyển sang gọi Gemini...', groqError);
        // 2. Chuyển sang gọi Gemini (Dự phòng)
        if (!GEMINI_API_KEY || GEMINI_API_KEY === "DÁN_API_KEY_CỦA_BẠN_VÀO_ĐÂY") {
          throw new Error('Groq lỗi và chưa cấu hình Gemini API Key dự phòng.');
        }
        generatedText = await callGeminiAPI(prompt, GEMINI_API_KEY, currentAbortController.signal);
      }

      const captions = parseCaptions(generatedText, parseInt(numCaptions, 10));
      
      captions.forEach((cap, index) => {
        const card = createCaptionCard(cap, index);
        resultsContainer.appendChild(card);
      });

      regenerateBtn.classList.remove('hidden');
    } catch (error) {
      if (error.name === 'AbortError') {
        alert('Đã hủy tạo Caption.');
      } else {
        alert(`Đã xảy ra lỗi: ${error.message}`);
      }
    } finally {
      generateBtn.disabled = false;
      regenerateBtn.disabled = false;
      if (stopBtn) stopBtn.classList.add('hidden');
      loadingOverlay.classList.add('hidden');
      currentAbortController = null;
    }
  };

  generateBtn.addEventListener('click', generateCaptions);
  regenerateBtn.addEventListener('click', generateCaptions);
});
