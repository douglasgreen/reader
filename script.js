document.addEventListener('DOMContentLoaded', () => {
    const textInput = document.getElementById('textInput');
    const processButton = document.getElementById('processButton');
    const rsvpDisplay = document.getElementById('rsvpDisplay');
    const rsvpTextElement = document.getElementById('rsvpText');
    const wpmInput = document.getElementById('wpmInput');
    const estimatedTimeElement = document.getElementById('estimatedTime');

    // Configuration Constants
    const MAX_CHUNK_LENGTH = 19; // Less than 20 characters per chunk
    const DELAY_BETWEEN_LINES = 1000; // Extra milliseconds delay between lines
    const DEFAULT_WPM = 300;
    const MIN_WPM_LIMIT = 50;  // Sensible minimum WPM
    const MAX_WPM_LIMIT = 2000; // Sensible maximum WPM
    const WPM_STEP = 25;      // Increment/decrement value for WPM

    // State Variables
    let allProcessedLines = []; // Array of arrays (lines, then chunks within lines)
    let currentLineIndex = 0;
    let currentChunkIndex = 0;
    let isPlaying = false;
    let timerId = null;
    let wordsPerMinute = parseInt(wpmInput.value, 10) || DEFAULT_WPM;

    // --- Helper Functions ---

    function updateWPMValue(newPotentialWPM) {
        let targetWPM = parseInt(newPotentialWPM, 10);

        if (isNaN(targetWPM)) {
            // If parsing new value fails (e.g., from a cleared input field),
            // fall back to the current valid wordsPerMinute.
            targetWPM = wordsPerMinute;
        }

        const minWPM = parseInt(wpmInput.min, 10) || MIN_WPM_LIMIT;
        const maxWPM = parseInt(wpmInput.max, 10) || MAX_WPM_LIMIT;

        let clampedWPM = Math.max(minWPM, Math.min(targetWPM, maxWPM));

        // Only proceed if the clamped WPM is different from the current WPM,
        // OR if the input field's displayed text needs to be corrected to the clamped WPM.
        if (clampedWPM !== wordsPerMinute || String(wpmInput.value) !== String(clampedWPM)) {
            wordsPerMinute = clampedWPM;
            wpmInput.value = String(clampedWPM); // Update the input field text

            console.log("WPM set to:", wordsPerMinute); // Log the new speed
            updateEstimatedTime(); // Recalculate and display estimated time

            if (isPlaying) {
                stopReading();
                startReading(); // startReading will use the updated wordsPerMinute (via wpmInput.value)
            }
        }
    }


    function calculateDelayPerLetter() {
        if (wordsPerMinute <= 0) return 300; // Default if WPM is invalid
        const delayPerWord = (60 * 1000) / wordsPerMinute;

        // Assume 5 letters in a word plus a space
        return delayPerWord / 6;
    }

    function countTotalWords(text) {
        if (!text || text.trim() === "") return 0;
        return text.split(/\s+/).filter(word => word.length > 0).length;
    }

    function updateEstimatedTime() {
        const rawText = textInput.value;

        // Use the synchronized wordsPerMinute variable for calculation
        const currentWPM = wordsPerMinute;
        const totalWords = countTotalWords(rawText);

        if (totalWords === 0 || currentWPM <= 0) {
            estimatedTimeElement.textContent = "Estimated reading time: --";
            return;
        }

        const timeInMinutes = totalWords / currentWPM;
        const totalSeconds = Math.round(timeInMinutes * 60);

        if (totalSeconds === 0 && totalWords > 0) {
             estimatedTimeElement.textContent = "Estimated reading time: < 1 sec";
             return;
        }

        const minutes = Math.floor(totalSeconds / 60);
        const seconds = totalSeconds % 60;

        let timeString = "Estimated reading time: ";
        if (minutes > 0) {
            timeString += `${minutes} min `;
        }
        if (seconds > 0 || minutes === 0) {
            timeString += `${seconds} sec`;
        }
        estimatedTimeElement.textContent = timeString.trim();
    }

    function recommendReadingSpeed() {
        const rawText = textInput.value.trim();
        if (rawText.length < 1000) {
            return;
        }

        const score = calculateFleschReadingEase(rawText);
        console.log(`Flesch Reading Ease score: ${score}`);

        // If 50 is the average score, increase reading speed when above average.
        const adjusted = 300 * score / 50;
        const recommended = Math.round(adjusted / 25) * 25;
        console.log(`Recommended reading speed: ${recommended} WPM`);
    }

    function chunkLine(line) {
        if (!line.trim()) return [];
        const words = line.split(/\s+/).filter(word => word.length > 0);
        const chunks = [];
        let currentChunk = "";
        for (const word of words) {
            if (currentChunk.length === 0) {
                currentChunk = word;
            } else if (currentChunk.length + 1 + word.length <= MAX_CHUNK_LENGTH) {
                currentChunk += " " + word;
            } else {
                chunks.push(currentChunk);
                currentChunk = word;
            }
        }
        if (currentChunk.length > 0) {
            chunks.push(currentChunk);
        }
        return chunks;
    }

    function processText() {
        const rawText = textInput.value;
        const lines = rawText.split('\n');
        allProcessedLines = lines.map(line => chunkLine(line)).filter(chunks => chunks.length > 0);
        currentLineIndex = 0;
        currentChunkIndex = 0;
        if (allProcessedLines.length > 0) {
            updateRsvpDisplay(allProcessedLines[0][0] || "[Start]");
            rsvpDisplay.classList.add('visible');
            container.classList.add("invisible");
        } else {
            updateRsvpDisplay("[No text processed]");
            rsvpDisplay.classList.remove('visible');
            container.classList.remove('invisible');
        }
        stopReading();
        updateEstimatedTime();
    }

    function updateRsvpDisplay(text) {
        rsvpTextElement.textContent = text;
    }

    function showCurrentPointer() {
        if (allProcessedLines.length === 0 || currentLineIndex >= allProcessedLines.length) {
            updateRsvpDisplay("[End of Text]");
            rsvpDisplay.classList.remove('visible');
            container.classList.remove('invisible');
            return;
        }
        const line = allProcessedLines[currentLineIndex];
        if (!line || currentChunkIndex >= line.length) {
            updateRsvpDisplay("[End of Line]"); // Should ideally not happen if logic is correct
            return;
        }
        updateRsvpDisplay(line[currentChunkIndex]);
        if (!rsvpDisplay.classList.contains('visible')) {
            rsvpDisplay.classList.add('visible');
        }
        if (!container.classList.contains('invisible')) {
            container.classList.add('invisible');
        }
    }

    function playNextChunk() {
        if (!isPlaying || allProcessedLines.length === 0) {
            stopReading();
            if(allProcessedLines.length === 0 && textInput.value.trim() !== "") processButton.click();
            else if (allProcessedLines.length === 0) updateRsvpDisplay("[Enter Text]");
            return;
        }

        if (currentLineIndex >= allProcessedLines.length) {
            updateRsvpDisplay("[End of Text]");
            stopReading();
            return;
        }

        const currentLine = allProcessedLines[currentLineIndex];
        if (currentChunkIndex >= currentLine.length) {
            currentLineIndex++;
            currentChunkIndex = 0;
            if (currentLineIndex >= allProcessedLines.length) {
                updateRsvpDisplay("[End of Text]");
                stopReading();
                return;
            }
            timerId = setTimeout(playNextChunk, DELAY_BETWEEN_LINES);
            return;
        }

        const chunk = currentLine[currentChunkIndex];
        updateRsvpDisplay(chunk);
        let weight = chunk.length;
        if (/[.?!]/.test(chunk)) weight += 5;
        if (/[,;:]/.test(chunk)) weight += 3;
        if (/[A-Z]/.test(chunk)) weight += 2;
        let delay = weight * calculateDelayPerLetter();
        currentChunkIndex++;
        timerId = setTimeout(playNextChunk, delay);
    }

    function startReading() {
        if (isPlaying) return;
        if (allProcessedLines.length === 0) {
            processText();
            if (allProcessedLines.length === 0) {
                 updateRsvpDisplay("[No text to read]");
                 setTimeout(() => {
                     if (!isPlaying) {
                         rsvpDisplay.classList.remove('visible');
                         container.classList.remove('invisible');
                     }
                 }, 1500);
                 return;
            }
        }
        isPlaying = true;
        rsvpDisplay.classList.add('visible');
        container.classList.add('invisible');

        // Ensure wordsPerMinute is current, reading from the input (which updateWPMValue keeps synced)
        wordsPerMinute = parseInt(wpmInput.value, 10) || DEFAULT_WPM;
        playNextChunk();
    }

    function stopReading() {
        isPlaying = false;
        if (timerId) {
            clearTimeout(timerId);
            timerId = null;
        }
        const percentDone = currentLineIndex / allProcessedLines.length * 100;
        console.log(percentDone.toFixed(1) + "% done");
    }

    function togglePlayPause() {
        if (isPlaying) {
            stopReading();
        } else {
            startReading();
        }
    }

    function navigateBackward() { // Go to start of current line, or start of previous line
        stopReading();
        if (allProcessedLines.length === 0) return;

        if (currentChunkIndex > 0) { // If not at the start of a line
            currentChunkIndex = 0;    // Go to start of current line
        } else if (currentLineIndex > 0) { // If at start of a line, and not the first line
            currentLineIndex--;         // Go to previous line
            currentChunkIndex = 0;    // At its start
        } else { // At start of first line
            currentChunkIndex = 0;
        }
        showCurrentPointer();
    }

    function navigateForward() { // Go to start of next line
        stopReading();
        if (allProcessedLines.length === 0) return;

        if (currentLineIndex < allProcessedLines.length - 1) {
            currentLineIndex++;
            currentChunkIndex = 0;
        } else { // On the last line, go to its end or stay at start if already there
            const currentFullLine = allProcessedLines[currentLineIndex];
            currentChunkIndex = currentFullLine.length > 0 ? currentFullLine.length -1 : 0;
        }
        showCurrentPointer();
    }

    // --- Event Listeners ---
    processButton.addEventListener('click', () => {
        processText();
        startReading();
    });

    textInput.addEventListener('input', () => {
        updateEstimatedTime();
        recommendReadingSpeed();
    });

    wpmInput.addEventListener('change', () => {
        // Let updateWPMValue handle parsing, clamping, and side effects
        updateWPMValue(parseInt(wpmInput.value, 10));
    });

    document.addEventListener('keydown', (event) => {
        const activeElement = document.activeElement;
        const isInputFocused = activeElement.tagName === 'INPUT' || activeElement.tagName === 'TEXTAREA';

        if (event.key === ' ') {
            if (!isInputFocused || rsvpDisplay.classList.contains('visible')) {
                 event.preventDefault();
                 togglePlayPause();
            }
        } else if (event.key === 'ArrowLeft') {
             if (!isInputFocused || rsvpDisplay.classList.contains('visible')) {
                event.preventDefault();
                navigateBackward();
            }
        } else if (event.key === 'ArrowRight') {
             if (!isInputFocused || rsvpDisplay.classList.contains('visible')) {
                event.preventDefault();
                navigateForward();
            }
        } else if (event.key === 'ArrowUp') { // New feature: Increase WPM
            if (!isInputFocused || rsvpDisplay.classList.contains('visible')) {
                event.preventDefault();
                updateWPMValue(wordsPerMinute + WPM_STEP);
            }
        } else if (event.key === 'ArrowDown') { // New feature: Decrease WPM
            if (!isInputFocused || rsvpDisplay.classList.contains('visible')) {
                event.preventDefault();
                updateWPMValue(wordsPerMinute - WPM_STEP);
            }
        } else if (event.key === 'Escape') {
            if (rsvpDisplay.classList.contains('visible')) {
                event.preventDefault();
                stopReading();
                rsvpDisplay.classList.remove('visible');
                container.classList.remove('invisible');
            }
        }
    });

    function calculateFleschReadingEase(text) {
        // Helper function to count syllables in a word
        function countSyllables(word) {
            word = word.toLowerCase();
            if (word.length <= 3) return 1;
            word = word.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, '');
            word = word.replace(/^y/, '');
            const syllableMatches = word.match(/[aeiouy]{1,2}/g);
            return syllableMatches ? syllableMatches.length : 1;
        }

        // Split text into sentences
        const sentences = text.split(/[.!?]+/).filter(Boolean);
        const totalSentences = sentences.length || 1;

        // Split text into words
        const words = text.match(/\b\w+\b/g) || [];
        const totalWords = words.length || 1;

        // Count total syllables
        let totalSyllables = 0;
        for (const word of words) {
            totalSyllables += countSyllables(word);
        }

        // Calculate FRE score
        const freScore =
            206.835 -
            1.015 * (totalWords / totalSentences) -
            84.6 * (totalSyllables / totalWords);

        return freScore.toFixed(2);
    }


    // --- Initial Setup ---
    updateRsvpDisplay("[Enter text and press 'Prepare Text' or Space]");
    // Sanitize initial WPM value from input and sync input field display
    updateWPMValue(wordsPerMinute); // This will clamp if needed and update dependent states
    // Initial call to estimate time based on current (possibly clamped) WPM
    updateEstimatedTime();
});
