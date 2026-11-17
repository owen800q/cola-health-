//! PP-OCRv6 text-line recognition for Cloudflare Workers.
//!
//! This is the recognition half of oar-ocr (`oar-ocr-core`'s CRNN model:
//! resize to height 48, BGR `(v / 255 - 0.5) / 0.5`, zero-pad, CTC greedy
//! decode) with ONNX Runtime swapped for `tract`, a pure-Rust ONNX engine.
//! ONNX Runtime is a native C++ library and cannot be linked into a
//! `wasm32-unknown-unknown` Worker; tract can.
//!
//! The exports are a plain C ABI so the Worker needs no generated JS glue.

use std::cell::RefCell;

use tract_onnx::prelude::*;

/// Input height the PP-OCR recognition models are trained on.
const HEIGHT: usize = 48;
/// Characters in model-output order; index 0 is the CTC blank and a space is
/// appended after the last entry (PaddleOCR's `use_space_char`).
const DICT: &str = include_str!("ppocrv6_dict.txt");

pub struct Recognizer {
    plan: Arc<TypedRunnableModel>,
    width: usize,
    chars: Vec<&'static str>,
}

pub struct Recognition {
    pub text: String,
    /// Mean probability of the decoded characters (0 when nothing is read).
    pub score: f32,
}

impl Recognizer {
    /// Builds the model for a fixed `[1, 3, 48, width]` input. A fixed width
    /// lets tract fully optimise the graph (about 3x faster than a symbolic
    /// one); narrower crops are zero-padded on the right.
    pub fn new(model: &[u8], width: usize) -> TractResult<Self> {
        let plan = tract_onnx::onnx()
            // The export's intermediate shape hints use symbolic dimensions
            // that contradict a concrete input shape.
            .with_ignore_value_info(true)
            .model_for_read(&mut &model[..])?
            .with_input_fact(0, f32::fact([1, 3, HEIGHT, width]).into())?
            .into_optimized()?
            .into_runnable()?;
        let mut chars: Vec<&'static str> = Vec::with_capacity(18_710);
        chars.push("");
        chars.extend(DICT.lines());
        chars.push(" ");
        Ok(Self { plan, width, chars })
    }

    /// Recognises one cropped text line from an encoded JPEG or PNG.
    pub fn recognize(&self, encoded: &[u8]) -> TractResult<Recognition> {
        let image = image::load_from_memory(encoded)?.to_rgb8();
        let (w, h) = image.dimensions();
        if w == 0 || h == 0 {
            return Err(TractError::msg("empty image"));
        }
        let resized_w = ((HEIGHT as f32 * w as f32 / h as f32).ceil() as usize).clamp(1, self.width);
        let resized = image::imageops::resize(
            &image,
            resized_w as u32,
            HEIGHT as u32,
            image::imageops::FilterType::Triangle,
        );

        let plane = HEIGHT * self.width;
        let mut input = vec![0f32; 3 * plane];
        for (i, px) in resized.as_raw().chunks_exact(3).enumerate() {
            let at = (i / resized_w) * self.width + i % resized_w;
            // The models take BGR.
            input[at] = px[2] as f32 / 127.5 - 1.0;
            input[plane + at] = px[1] as f32 / 127.5 - 1.0;
            input[2 * plane + at] = px[0] as f32 / 127.5 - 1.0;
        }
        let tensor = Tensor::from_shape(&[1, 3, HEIGHT, self.width], &input)?;
        let outputs = self.plan.run(tvec!(tensor.into()))?;
        let probs = outputs[0].to_plain_array_view::<f32>()?;
        let shape = probs.shape();
        if shape.len() != 3 || shape[2] != self.chars.len() {
            return Err(TractError::msg(format!(
                "unexpected model output {shape:?} for {} characters",
                self.chars.len()
            )));
        }

        // CTC greedy decode: best class per step, drop repeats, then blanks.
        let mut text = String::new();
        let (mut sum, mut kept, mut previous) = (0f32, 0u32, 0usize);
        for step in probs.as_slice().unwrap().chunks_exact(shape[2]) {
            let (best, p) = step
                .iter()
                .enumerate()
                .fold((0, f32::MIN), |acc, (i, &p)| if p > acc.1 { (i, p) } else { acc });
            if best != 0 && best != previous {
                text.push_str(self.chars[best]);
                sum += p;
                kept += 1;
            }
            previous = best;
        }
        let score = if kept > 0 { sum / kept as f32 } else { 0.0 };
        Ok(Recognition { text, score })
    }
}

// ---- C ABI for the Worker -------------------------------------------------

thread_local! {
    static RECOGNIZER: RefCell<Option<Recognizer>> = const { RefCell::new(None) };
    static RESULT: RefCell<Vec<u8>> = const { RefCell::new(Vec::new()) };
}

fn set_result(bytes: &[u8]) {
    RESULT.with(|r| {
        let mut r = r.borrow_mut();
        r.clear();
        r.extend_from_slice(bytes);
    });
}

#[no_mangle]
pub extern "C" fn ocr_alloc(len: usize) -> *mut u8 {
    let mut buffer = Vec::<u8>::with_capacity(len);
    let ptr = buffer.as_mut_ptr();
    std::mem::forget(buffer);
    ptr
}

/// # Safety
/// `ptr`/`len` must come from `ocr_alloc(len)`.
#[no_mangle]
pub unsafe extern "C" fn ocr_free(ptr: *mut u8, len: usize) {
    drop(Vec::from_raw_parts(ptr, 0, len));
}

/// Loads the ONNX model. Returns 0 on success; otherwise the error text is
/// the result buffer.
///
/// # Safety
/// `ptr`/`len` must be a readable buffer.
#[no_mangle]
pub unsafe extern "C" fn ocr_load(ptr: *const u8, len: usize, width: usize) -> i32 {
    match Recognizer::new(std::slice::from_raw_parts(ptr, len), width) {
        Ok(recognizer) => {
            RECOGNIZER.with(|r| *r.borrow_mut() = Some(recognizer));
            0
        }
        Err(error) => {
            set_result(format!("{error:#}").as_bytes());
            1
        }
    }
}

/// Recognises an encoded image. Returns 0 on success, with the text in the
/// result buffer; otherwise the result buffer holds the error text.
///
/// # Safety
/// `ptr`/`len` must be a readable buffer.
#[no_mangle]
pub unsafe extern "C" fn ocr_recognize(ptr: *const u8, len: usize) -> i32 {
    let outcome = RECOGNIZER.with(|r| match r.borrow().as_ref() {
        Some(recognizer) => recognizer.recognize(std::slice::from_raw_parts(ptr, len)),
        None => Err(TractError::msg("model not loaded")),
    });
    match outcome {
        Ok(recognition) => {
            SCORE.with(|s| s.set(recognition.score));
            set_result(recognition.text.as_bytes());
            0
        }
        Err(error) => {
            set_result(format!("{error:#}").as_bytes());
            1
        }
    }
}

thread_local! {
    static SCORE: std::cell::Cell<f32> = const { std::cell::Cell::new(0.0) };
}

/// Confidence of the last successful `ocr_recognize`.
#[no_mangle]
pub extern "C" fn ocr_score() -> f32 {
    SCORE.with(|s| s.get())
}

#[no_mangle]
pub extern "C" fn ocr_result_ptr() -> *const u8 {
    RESULT.with(|r| r.borrow().as_ptr())
}

#[no_mangle]
pub extern "C" fn ocr_result_len() -> usize {
    RESULT.with(|r| r.borrow().len())
}
