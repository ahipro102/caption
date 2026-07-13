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

  // BẠN VẪN CÓ THỂ ĐIỀN API KEY CỨNG Ở ĐÂY NẾU MUỐN (Sẽ dùng làm dự phòng nếu giao diện để trống)
  const GEMINI_API_KEY = "DÁN_API_KEY_CỦA_BẠN_VÀO_ĐÂY";

  const apiKeyInput = document.getElementById('apiKey');
  const saveApiKeyBtn = document.getElementById('saveApiKeyBtn');
  const aiModelSelect = document.getElementById('aiModel');
  const contentInput = document.getElementById('content');
  const requirementsInput = document.getElementById('requirements');
  const charLimitInput = document.getElementById('charLimit');
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

  // Tự động tải danh sách Model từ Groq API
  const loadGroqModels = async (apiKey) => {
    if (!apiKey || !aiModelSelect) return;
    try {
      aiModelSelect.innerHTML = '<option value="">Đang tải danh sách Model...</option>';
      const response = await fetch('https://api.groq.com/openai/v1/models', {
        headers: { 'Authorization': `Bearer ${apiKey}` }
      });
      if (response.ok) {
        const data = await response.json();
        aiModelSelect.innerHTML = '';
        
        // Lọc bớt các model âm thanh (whisper) để lại model văn bản
        const textModels = data.data.filter(m => !m.id.includes('whisper'));
        textModels.sort((a, b) => a.id.localeCompare(b.id));

        textModels.forEach(model => {
          const option = document.createElement('option');
          option.value = model.id;
          option.textContent = model.id;
          aiModelSelect.appendChild(option);
        });

        // Tự động chọn một model nhẹ/nhanh làm mặc định nếu có
        const defaultModels = ['llama-3.1-8b-instant', 'llama3-8b-8192', 'gemma2-9b-it'];
        for (const dm of defaultModels) {
          const match = Array.from(aiModelSelect.options).find(opt => opt.value === dm);
          if (match) {
            match.selected = true;
            break;
          }
        }
      } else {
        aiModelSelect.innerHTML = '<option value="">Lỗi tải Model (Key có thể sai)</option>';
      }
    } catch (error) {
      aiModelSelect.innerHTML = '<option value="">Không thể tải Model</option>';
      console.error('Failed to load models', error);
    }
  };

  // Load API Key from localStorage
  const savedApiKey = localStorage.getItem('groqApiKey');
  if (savedApiKey) {
    apiKeyInput.value = savedApiKey;
    loadGroqModels(savedApiKey); // Tải model ngay khi trang khởi động nếu đã lưu key
  }

  // Save API Key on button click
  if (saveApiKeyBtn) {
    saveApiKeyBtn.addEventListener('click', () => {
      const keyToSave = apiKeyInput.value.trim();
      if (keyToSave) {
        localStorage.setItem('groqApiKey', keyToSave);
        saveApiKeyBtn.textContent = 'Đã lưu!';
        saveApiKeyBtn.style.backgroundColor = '#28a745';
        saveApiKeyBtn.style.color = 'white';
        
        // Tải danh sách model ngay khi người dùng lưu key thành công
        loadGroqModels(keyToSave);

        setTimeout(() => {
          saveApiKeyBtn.textContent = 'Lưu Key';
          saveApiKeyBtn.style.backgroundColor = 'var(--secondary)';
          saveApiKeyBtn.style.color = '#a32a13';
        }, 2000);
      } else {
        alert('Vui lòng nhập Key trước khi lưu!');
      }
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
        throw new Error(errorData.error?.message || 'Lỗi kết nối tới API');
      }

      const data = await response.json();
      return data.choices[0].message.content;
    } catch (error) {
      console.error('Error:', error);
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
      let cleanedCap = cap.replace(/#\S+/g, '').trim();
      
      // Sau đó mới nối đúng một hashtag duy nhất của chúng ta vào cuối
      return cleanedCap + '\n\n#MamNonAqua';
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
    // Lấy từ UI trước, nếu trống thì lấy từ hằng số GEMINI_API_KEY dự phòng
    let apiKey = apiKeyInput.value.trim();
    if (!apiKey || apiKey === "") {
      apiKey = GEMINI_API_KEY;
    }
    
    if (!apiKey || apiKey === "DÁN_API_KEY_CỦA_BẠN_VÀO_ĐÂY") {
      alert('Vui lòng nhập Groq API Key hoặc lưu lại vào mã nguồn!');
      apiKeyInput.focus();
      return;
    }

    const content = contentInput.value.trim();
    if (!content) {
      alert('Vui lòng nhập nội dung bài viết!');
      contentInput.focus();
      return;
    }

    const reqs = requirementsInput.value.trim();
    const charLimit = charLimitInput.value || 500;
    const numCaptions = numCaptionsInput.value || 3;

    let prompt = `Bạn là một chuyên gia về Facebook Marketing, đặc biệt là trong lĩnh vực giáo dục mầm non. Bạn đang làm việc cho trường mầm non Aqua.
Hãy viết ${numCaptions} mẫu caption Facebook khác nhau dựa trên thông tin sau:
- Nội dung chính: "${content}"
- Giọng văn (QUAN TRỌNG): Nhí nhảnh, dễ thương, dạt dào cảm xúc, đúng chuẩn tinh thần trẻ mầm non ngây thơ trong sáng. Phải làm cho phụ huynh đọc vào là có cảm tình và rung động ngay từ câu đầu tiên.
- Hình thức: Viết chuẩn thuật toán SEO Facebook. Chèn các emoji thật sinh động, khéo léo.
${reqs ? `- Yêu cầu thêm từ bạn: "${reqs}"` : ''}
- KẾT QUẢ ĐẦU RA TUYỆT ĐỐI KHÔNG DÀI QUÁ ${charLimit} KÝ TỰ cho MỖI caption. Bạn phải ngầm tự đếm số lượng ký tự trước, nhưng TUYỆT ĐỐI KHÔNG in số ký tự đó ra kết quả (ví dụ: cấm in "(396 ký tự)"). Chỉ trả về nội dung caption.
- BẮT BUỘC: CHỈ ĐƯỢC PHÉP dùng duy nhất MỘT hashtag là #MamNonAqua ở cuối mỗi caption. TUYỆT ĐỐI KHÔNG thêm bất kỳ hashtag nào khác (kể cả những cái liên quan).

Dưới đây là các văn phong mẫu CHUẨN MỰC để bạn bắt chước 100% cái hồn, cách dùng từ và cách đặt emoji (đây là ví dụ bé tập câu cá, hãy áp dụng giọng văn này cho nội dung hiện tại):
Mẫu 1: 🎣 Ngắm nhìn những "cần thủ" nhí tại Trường Mầm non Aqua say sưa trổ tài câu cá! Qua trò chơi này, các con không chỉ rèn luyện sự khéo léo, kiên nhẫn mà còn học được cách tập trung cao độ. Yêu lắm những đôi tay nhỏ xíu này! ❤️🐟 #MamNonAqua
Mẫu 2: 🐠 Hôm nay lớp chúng mình đi câu cá nhé! Nhìn các con hào hứng reo hò khi "tóm" được chú cá nhỏ, cô thấy niềm vui như lan tỏa khắp phòng. Trường Mầm non Aqua luôn là nơi lưu giữ những khoảnh khắc tuổi thơ ngọt ngào nhất của các con. 🏫🧸 #MamNonAqua
Mẫu 3: 🌊 Giờ chơi mà học tại Trường Mầm non Aqua: Bé tập câu cá! Trò chơi giúp con nhận biết màu sắc và phát triển vận động tinh cực tốt. Từng chú cá sắc màu được đưa lên bờ trong niềm hạnh phúc của cả cô và trò. 🎨✨ #MamNonAqua

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
      const selectedModel = aiModelSelect ? aiModelSelect.value : 'llama-3.1-8b-instant';
      
      if (!selectedModel) {
        alert('Danh sách Model chưa được tải hoặc không hợp lệ. Vui lòng kiểm tra lại API Key!');
        throw new Error('Chưa chọn Model');
      }

      const generatedText = await callGroqAPI(prompt, apiKey, selectedModel, currentAbortController.signal);
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
