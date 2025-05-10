from typing import List

from app.models.flash_card import FlashCard

flashcards: List[FlashCard] = [
    FlashCard(
        id=1,
        text="What is the core innovation of the Transformer network architecture proposed in this paper?",
        answer="The Transformer is based solely on attention mechanisms, dispensing with recurrence and convolutions entirely.",
        text_reference="Abstract: We propose a new simple network architecture, the Transformer, based solely on attention mechanisms, dispensing with recurrence and convolutions entirely."
    ),
    FlashCard(
        id=2,
        text="What are the two sub-layers in each encoder layer of the Transformer model?",
        answer="The first sub-layer is a multi-head self-attention mechanism, and the second is a simple, position-wise fully connected feed-forward network.",
        text_reference="Page 3, Section 3.1 Encoder: Each layer has two sub-layers. The first is a multi-head self-attention mechanism, and the second is a simple, position-wise fully connected feed-forward network."
    ),
    FlashCard(
        id=3,
        text="How does the Transformer model account for the order of tokens in a sequence, given it lacks recurrence or convolution?",
        answer="It uses 'positional encodings' which are added to the input embeddings at the bottoms of the encoder and decoder stacks. These encodings use sine and cosine functions of different frequencies.",
        text_reference="Page 6, Section 3.5 Positional Encoding: Since our model contains no recurrence and no convolution, in order for the model to make use of the order of the sequence, we must inject some information about the relative or absolute position of the tokens in the sequence. To this end, we add \"positional encodings\" to the input embeddings..."
    ),
    FlashCard(
        id=4,
        text="What is the formula for Scaled Dot-Product Attention as defined in the paper?",
        answer="Attention(Q, K, V) = softmax( (Q*K^T) / sqrt(dk) ) * V, where Q, K, V are matrices of queries, keys, and values, and dk is the dimension of keys.",
        text_reference="Page 4, Section 3.2.1 Scaled Dot-Product Attention, Equation (1): Attention(Q, K, V) = softmax(QKT / √dk)V"
    ),
    FlashCard(
        id=5,
        text="In what three different ways does the Transformer use multi-head attention?",
        answer="1. In 'encoder-decoder attention' layers (queries from decoder, keys/values from encoder). 2. In encoder self-attention layers (queries, keys, values from previous encoder layer). 3. In decoder self-attention layers (queries, keys, values from previous decoder layer, with masking for autoregression).",
        text_reference="Page 5, Section 3.2.3 Applications of Attention in our Model"
    )
]

flashcards_history = [
    {"flashcard_id": "1", "reaction": "Easy", "timestamp": "2023-10-01T12:00:00Z"},
    {"flashcard_id": "2", "reaction": "Hard", "timestamp": "2023-10-02T12:00:00Z"},
]
