import Processor from "@src/class/Processor";
import { storeCode } from "@src/module-store/CodeStore";
import { createContext, useEffect, useReducer, useRef, type ReactNode } from "react";
import { 
    DEFAULT_SOURCE_CODE,
    EXECUTION_END,
    EXECUTION_START,
    INCREMENT_SIZE_EXECUTION,
    INCREMENT_SIZE_REGULAR,
    PLAY_INTERVALL,
    REGULAR_END,
    REGULAR_START,
    DEFAULT_EXECUTION_STATE,
    MINIMUM_EXECUTION_SIZE,
} from "@src/constants/CodeProvider";
import { CodeAction, type ActionFunction, type CodePayload, type DispatchCode } from "@src/interface/DispatchCode";
import { PlayerMode } from "@src/interface/StepControl";
import { HighlightSyntaxVisitor } from "@src/class/visitor/HighligthSyntax";
import { ParserVisitor } from "@src/class/visitor/Parser";
import { SyntaxCheckerVisitor } from "@src/class/visitor/SyntaxChecker";

/**
 * Contexte pour accéder au valeur du code et son état
 */
export const ProcessorContext = createContext<Processor>(DEFAULT_SOURCE_CODE);

/**
 * Permets d'obtenir le dispatch pour effectuer des actions
 */
export const DispatchProcessorContext = createContext<DispatchCode>(()=>{});

/**
 * Permets au enfant d'utiliser les deux contextes ainsi que de créer le reducer
 * @prop children - Noeuds à l'intérieur lors de son utilisation
 * @returns l'élément qui distribue les deux contextes
 */
export function CodeProvider({ children }: { children: ReactNode }) {
    const [ state, dispatch ] = useReducer(codeReducer, DEFAULT_SOURCE_CODE);

    const playingRef = useRef<boolean>(state.isPlaying);

    function callNext() {
        if( playingRef.current ) {
            dispatch({ type: CodeAction.FORWARD });
            setTimeout(callNext, PLAY_INTERVALL);
        }
    }

    useEffect(() => {
        playingRef.current = state.isPlaying;
        if ( state.isPlaying ) {
            setTimeout(callNext, PLAY_INTERVALL);
        }
    }, [state.isPlaying, dispatch]);

    return(
        <ProcessorContext.Provider value={ state } >
                    <DispatchProcessorContext.Provider value={ dispatch } >
                        { children }
                    </DispatchProcessorContext.Provider>
        </ProcessorContext.Provider>
    );
}

const actionMap: Record<CodeAction, ActionFunction> = {
    [CodeAction.CHANGE_CODE]: changeCode,
    [CodeAction.CHANGE_PROCESSOR]: changeProcessor,
    [CodeAction.TO_START]: toStart,
    [CodeAction.TO_END]: toEnd,
    [CodeAction.FORWARD]: forward,
    [CodeAction.BACKWARD]: backward,
    [CodeAction.CHANGE_EXECUTED_CODE]: changeExecutedCode,
    [CodeAction.PLAY_AND_PAUSE]: playAndPause,
    [CodeAction.CHANGE_MODE]: changeMode,
    [CodeAction.RESET_CODE]: resetExecutionState,
    [CodeAction.CHANGE_STEP]: changeStep,
};

/**
 * Associe le type d'action avec la bonne fonction pour mettre à jour l'état
 * 
 * @param state - État courant
 * @param action - Action à prendre par la logique de code
 * @returns Le prochain état
 */
function codeReducer(state: Processor, action: CodePayload): Processor {
    const actionFunction = actionMap[action.type];
    return actionFunction(state, action);
}

/**
 * Change l'état courant du code écrit par l'utilisateur 
 * @param state État courant
 * @param action Entrée pour permettre de changer le code
 * @returns le prochain état
 */
function changeCode(state: Processor, action: CodePayload): Processor {
    let newState = state.clone();
    if (action.code === "" || action.code) {
        storeCode(state.processorId, action.code);
        newState.code = action.code;
        newState.accept(new ParserVisitor());
        newState.accept(new SyntaxCheckerVisitor());
        newState.accept(new HighlightSyntaxVisitor());
        newState = resetExecutionState(newState);

    }
    return newState;
}

/**
 * Permets de changer le processeur utilisé
 * @param state État courant
 * @param action Entrée permettant de changer vers le bon processeur
 * @returns le prochain état
 */
function changeProcessor(state: Processor, action: CodePayload): Processor {
    if ( action.newProcessor && action.newProcessor.processorId != state.processorId ) {
        action.newProcessor.accept(new ParserVisitor());
        action.newProcessor.accept(new SyntaxCheckerVisitor());
        action.newProcessor.accept(new HighlightSyntaxVisitor());
        return action.newProcessor.clone();
    }
    return state.clone();
}

/**
 * Avance d'une étape l'exécution de la simulation
 * @param state État courant
 * @returns le prochain état 
 */
function forward(state: Processor): Processor {
    const newState = state.clone();
    const inc = state.mode === PlayerMode.regular ? INCREMENT_SIZE_REGULAR : INCREMENT_SIZE_EXECUTION;
    if ( state.steps &&  state.count + inc < state.steps.length  ) {
        newState.count += inc;
    }
    return newState;
}

/**
 * Recule d'une étape l'exécution de la simulation
 * @param state état courant
 * @returns le prochain état
 */
function backward(state: Processor): Processor {
    const newState = state.clone();
    const inc = state.mode === PlayerMode.regular ? INCREMENT_SIZE_REGULAR : INCREMENT_SIZE_EXECUTION;
    if ( state.count - inc >= 0 ) {
        newState.count -= inc;
    }
    return newState;
}

/**
 * Réinitialise le compteur d'exécution
 * @param state l'état courant
 * @returns le prochain état
 */
function toStart(state: Processor): Processor {
    const newState = state.clone();
    const start = state.mode === PlayerMode.regular ? REGULAR_START : EXECUTION_START;
    newState.count = start;
    return newState;
}

/**
 * Envoi le compteur à la fin de l'exécution de la simulation
 * @param state l'état courant
 * @returns le prochain état 
 */
function toEnd(state: Processor): Processor {
    const newState = state.clone();
    const end = state.mode === PlayerMode.regular ? REGULAR_END : EXECUTION_END;
    newState.count = state.steps.length - end;
    return newState;
}

/**
 * Permets de changé l'état du code compilé qui est à exécuter
 * @param state l'état courant
 * @param action contient le code compilé
 * @returns le prochain état
 */
function changeExecutedCode(state: Processor, action: CodePayload): Processor {
    const newState = state.clone();
    if ( action.executedCode ) {
        newState.steps = action.executedCode;
        newState.count = state.mode === PlayerMode.regular || state.steps.length <= MINIMUM_EXECUTION_SIZE ? REGULAR_START : EXECUTION_START;
    }
    return newState;
}

/**
 * Change l'état de lecture automatique
 * @param state - l'état courant
 * @returns le prochain état
 */
function playAndPause(state: Processor): Processor {
    const newState = state.clone();
    newState.isPlaying = !state.isPlaying;
    return newState;
}

/**
 * Change le mode d'exécution du code compilé
 * @param state - l'état courant
 * @param action - contient le prochain mode
 * @returns le prochain état
 */
function changeMode(state: Processor, action: CodePayload): Processor {
    const newState = state.clone();
    if( action.mode ) {
        newState.mode = action.mode;
        newState.count = action.mode === PlayerMode.regular || state.steps.length <= MINIMUM_EXECUTION_SIZE ? REGULAR_START : EXECUTION_START;
    }
    return newState;
}

/**
 * Remets l'état du code compilé à zéro
 * @param state - l'état courant
 * @returns le prochain état
 */
function resetExecutionState(state: Processor): Processor {
    const newState = state.clone();
    newState.isPlaying = false;
    newState.steps = DEFAULT_EXECUTION_STATE;
    newState.count = 0;
    return newState;
}

function changeStep(state: Processor, action: CodePayload): Processor {
    const newState = state.clone();
    if ( action.newStep !== undefined && action.newStep >= 0 && action.newStep < state.steps.length ) {
        newState.count = action.newStep;
        newState.mode = PlayerMode.regular;
    }
    return newState;
}
