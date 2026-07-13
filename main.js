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
  const regenerateBtn = document.getElementById('regenerateBtn');
  const resultsContainer = document.getElementById('resultsContainer');
  const loadingOverlay = document.getElementById('loading');
  const logoutBtn = document.getElementById('logoutBtn');

  if (logoutBtn) {
    logoutBtn.addEventListener('click', () => {
      sessionStorage.removeItem('isAuthenticated');
      sessionStorage.removeItem('currentUser');
      window.location.href = 'login.html';
    });
  }

  // Load API Key from localStorage
  const savedApiKey = localStorage.getItem('geminiApiKey');
  if (savedApiKey) {
    apiKeyInput.value = savedApiKey;
  }

  // Save API Key on button click
  if (saveApiKeyBtn) {
    saveApiKeyBtn.addEventListener('click', () => {
      const keyToSave = apiKeyInput.value.trim();
      if (keyToSave) {
        localStorage.setItem('geminiApiKey', keyToSave);
        saveApiKeyBtn.textContent = 'Đã lưu!';
        saveApiKeyBtn.style.backgroundColor = '#28a745';
        saveApiKeyBtn.style.color = 'white';
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

  const callGeminiAPI = async (prompt, apiKey, modelName) => {
    // Sử dụng model được chọn từ giao diện
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;
    
    const requestBody = {
      contents: [{
        parts: [{ text: prompt }]
      }],
      generationConfig: {
        temperature: 0.7,
      }
    };

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody)
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error?.message || 'Lỗi kết nối tới API');
      }

      const data = await response.json();
      return data.candidates[0].content.parts[0].text;
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

    // Append hashtag if not present
    return captions.map(cap => {
      let trimmed = cap.trim();
      if (!trimmed.toLowerCase().includes('#mamnonaqua')) {
        trimmed += '\n\n#MamnonAqua';
      }
      return trimmed;
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
      alert('Vui lòng nhập Google Gemini API Key hoặc lưu lại vào mã nguồn!');
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
${reqs ? `- Yêu cầu thêm: "${reqs}"` : ''}
- Giới hạn: Không dài quá ${charLimit} ký tự cho mỗi caption, viết súc tích, không giông dài.
- BẮT BUỘC: Thêm hashtag #MamnonAqua ở cuối mỗi caption.
Hãy trả về kết quả dưới dạng danh sách được đánh số (1., 2., 3.). Chỉ trả về nội dung caption, không cần bình luận thêm.`;

    // UI Updates
    resultsContainer.innerHTML = '';
    generateBtn.disabled = true;
    regenerateBtn.disabled = true;
    loadingOverlay.classList.remove('hidden');

    try {
      const selectedModel = aiModelSelect ? aiModelSelect.value : 'gemini-pro';
      const generatedText = await callGeminiAPI(prompt, apiKey, selectedModel);
      const captions = parseCaptions(generatedText, parseInt(numCaptions, 10));
      
      captions.forEach((cap, index) => {
        const card = createCaptionCard(cap, index);
        resultsContainer.appendChild(card);
      });

      regenerateBtn.classList.remove('hidden');
    } catch (error) {
      alert(`Đã xảy ra lỗi: ${error.message}`);
    } finally {
      generateBtn.disabled = false;
      regenerateBtn.disabled = false;
      loadingOverlay.classList.add('hidden');
    }
  };

  generateBtn.addEventListener('click', generateCaptions);
  regenerateBtn.addEventListener('click', generateCaptions);
});
