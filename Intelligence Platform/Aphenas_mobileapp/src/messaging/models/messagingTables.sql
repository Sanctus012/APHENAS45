CREATE TABLE IF NOT EXISTS conversations (

    id SERIAL PRIMARY KEY,

    type VARCHAR(50) NOT NULL DEFAULT 'DIRECT',

    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()

);



CREATE TABLE IF NOT EXISTS conversation_members (

    id SERIAL PRIMARY KEY,

    conversation_id INTEGER NOT NULL
        REFERENCES conversations(id)
        ON DELETE CASCADE,

    user_id INTEGER NOT NULL
        REFERENCES auth_user(id)
        ON DELETE CASCADE,

    joined_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    UNIQUE(
        conversation_id,
        user_id
    )

);



CREATE TABLE IF NOT EXISTS messages (

    id SERIAL PRIMARY KEY,

    conversation_id INTEGER NOT NULL
        REFERENCES conversations(id)
        ON DELETE CASCADE,

    sender_id INTEGER NOT NULL
        REFERENCES auth_user(id)
        ON DELETE CASCADE,

    content TEXT NOT NULL,

    message_type VARCHAR(50)
        DEFAULT 'TEXT',

    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()

);


CREATE TABLE IF NOT EXISTS message_receipts (

    id SERIAL PRIMARY KEY,

    message_id INTEGER NOT NULL
        REFERENCES messages(id)
        ON DELETE CASCADE,

    recipient_id INTEGER NOT NULL
        REFERENCES auth_user(id)
        ON DELETE CASCADE,

    delivered_at TIMESTAMP WITH TIME ZONE,

    read_at TIMESTAMP WITH TIME ZONE,

    UNIQUE(message_id, recipient_id)

);

