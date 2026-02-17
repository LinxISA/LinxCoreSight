/*
 ****************************************************************************
 *
 *                   "DHRYSTONE" Benchmark Program
 *                   -----------------------------
 *
 *  Version:    C, Version 2.1 (ported for LinxISA)
 *
 *  File:       dhry_1.c (part 2 of 3)
 *
 ****************************************************************************
 */

#include "dhry.h"

/* Global Variables: */

Rec_Pointer Ptr_Glob, Next_Ptr_Glob;
int Int_Glob;
Boolean Bool_Glob;
char Ch_1_Glob, Ch_2_Glob;
int Arr_1_Glob[50];
int Arr_2_Glob[50][50];

#ifndef REG
Boolean Reg = false;
#define REG
#else
Boolean Reg = true;
#endif

/* Forward declarations (K&R style retained). */
Enumeration Func_1();

static int dhry_validate(int Number_Of_Runs, One_Fifty Int_1_Loc, One_Fifty Int_2_Loc, One_Fifty Int_3_Loc,
                         Enumeration Enum_Loc, Str_30 Str_1_Loc, Str_30 Str_2_Loc)
{
    int ok = 1;

    if (Int_Glob != 5) ok = 0;
    if (Bool_Glob != true) ok = 0;
    if (Ch_1_Glob != 'A') ok = 0;
    if (Ch_2_Glob != 'B') ok = 0;
    if (Arr_1_Glob[8] != 7) ok = 0;
    if (Arr_2_Glob[8][7] != (Number_Of_Runs + 10)) ok = 0;

    if (Ptr_Glob->Discr != Ident_1) ok = 0;
    if (Ptr_Glob->variant.var_1.Enum_Comp != Ident_3) ok = 0;
    if (Ptr_Glob->variant.var_1.Int_Comp != 17) ok = 0;
    if (strcmp(Ptr_Glob->variant.var_1.Str_Comp, "DHRYSTONE PROGRAM, SOME STRING") != 0) ok = 0;

    if (Next_Ptr_Glob->Discr != Ident_1) ok = 0;
    if (Next_Ptr_Glob->variant.var_1.Enum_Comp != Ident_2) ok = 0;
    if (Next_Ptr_Glob->variant.var_1.Int_Comp != 18) ok = 0;
    if (strcmp(Next_Ptr_Glob->variant.var_1.Str_Comp, "DHRYSTONE PROGRAM, SOME STRING") != 0) ok = 0;

    if (Int_1_Loc != 5) ok = 0;
    if (Int_2_Loc != 13) ok = 0;
    if (Int_3_Loc != 7) ok = 0;
    if (Enum_Loc != Ident_2) ok = 0;
    if (strcmp(Str_1_Loc, "DHRYSTONE PROGRAM, 1'ST STRING") != 0) ok = 0;
    if (strcmp(Str_2_Loc, "DHRYSTONE PROGRAM, 2'ND STRING") != 0) ok = 0;

    return ok ? 0 : 1;
}

int main(void)
{
    One_Fifty Int_1_Loc;
    REG One_Fifty Int_2_Loc;
    One_Fifty Int_3_Loc;
    REG char Ch_Index;
    Enumeration Enum_Loc;
    Str_30 Str_1_Loc;
    Str_30 Str_2_Loc;
    REG int Run_Index;
    REG int Number_Of_Runs;

    /* Initializations */
    Next_Ptr_Glob = (Rec_Pointer)malloc(sizeof(Rec_Type));
    Ptr_Glob = (Rec_Pointer)malloc(sizeof(Rec_Type));
    if (!Next_Ptr_Glob || !Ptr_Glob) {
        printf("error: malloc failed\n");
        return 1;
    }

    Ptr_Glob->Ptr_Comp = Next_Ptr_Glob;
    Ptr_Glob->Discr = Ident_1;
    Ptr_Glob->variant.var_1.Enum_Comp = Ident_3;
    Ptr_Glob->variant.var_1.Int_Comp = 40;
    strcpy(Ptr_Glob->variant.var_1.Str_Comp, "DHRYSTONE PROGRAM, SOME STRING");
    strcpy(Str_1_Loc, "DHRYSTONE PROGRAM, 1'ST STRING");

    Arr_2_Glob[8][7] = 10;

    printf("\n");
    printf("Dhrystone Benchmark, Version 2.1 (Language: C) [LinxISA]\n");
    printf("\n");
    if (Reg) {
        printf("Program compiled with 'register' attribute\n\n");
    } else {
        printf("Program compiled without 'register' attribute\n\n");
    }

    Number_Of_Runs = DHRY_RUNS;
    printf("Execution starts, %d runs through Dhrystone\n", Number_Of_Runs);

    for (Run_Index = 1; Run_Index <= Number_Of_Runs; ++Run_Index) {
        Proc_5();
        Proc_4();
        Int_1_Loc = 2;
        Int_2_Loc = 3;
        strcpy(Str_2_Loc, "DHRYSTONE PROGRAM, 2'ND STRING");
        Enum_Loc = Ident_2;
        Bool_Glob = !Func_2(Str_1_Loc, Str_2_Loc);
        while (Int_1_Loc < Int_2_Loc) {
            Int_3_Loc = 5 * Int_1_Loc - Int_2_Loc;
            Proc_7(Int_1_Loc, Int_2_Loc, &Int_3_Loc);
            Int_1_Loc += 1;
        }
        Proc_8(Arr_1_Glob, Arr_2_Glob, Int_1_Loc, Int_3_Loc);
        Proc_1(Ptr_Glob);
        for (Ch_Index = 'A'; Ch_Index <= Ch_2_Glob; ++Ch_Index) {
            if (Enum_Loc == Func_1(Ch_Index, 'C')) {
                Proc_6(Ident_1, &Enum_Loc);
                strcpy(Str_2_Loc, "DHRYSTONE PROGRAM, 3'RD STRING");
                Int_2_Loc = Run_Index;
                Int_Glob = Run_Index;
            }
        }
        Int_2_Loc = Int_2_Loc * Int_1_Loc;
        Int_1_Loc = Int_2_Loc / Int_3_Loc;
        Int_2_Loc = 7 * (Int_2_Loc - Int_3_Loc) - Int_1_Loc;
        Proc_2(&Int_1_Loc);
    }

    printf("Execution ends\n\n");

    /* Print a short summary (original program prints a long expected-values list). */
    printf("Int_Glob=%d Bool_Glob=%d Ch_1=%c Ch_2=%c Arr_1[8]=%d Arr_2[8][7]=%d\n",
           Int_Glob, Bool_Glob, Ch_1_Glob, Ch_2_Glob, Arr_1_Glob[8], Arr_2_Glob[8][7]);

    int rc = dhry_validate(Number_Of_Runs, Int_1_Loc, Int_2_Loc, Int_3_Loc, Enum_Loc, Str_1_Loc, Str_2_Loc);
    if (rc == 0) {
        printf("Correct operation validated.\n");
        return 0;
    }

    printf("Errors detected.\n");
    return 1;
}

/* The remaining procedures are from the Netlib distribution (kept as-is). */

Proc_1(Ptr_Val_Par)
REG Rec_Pointer Ptr_Val_Par;
{
    REG Rec_Pointer Next_Record = Ptr_Val_Par->Ptr_Comp;

    structassign(*Ptr_Val_Par->Ptr_Comp, *Ptr_Glob);
    Ptr_Val_Par->variant.var_1.Int_Comp = 5;
    Next_Record->variant.var_1.Int_Comp = Ptr_Val_Par->variant.var_1.Int_Comp;
    Next_Record->Ptr_Comp = Ptr_Val_Par->Ptr_Comp;
    Proc_3(&Next_Record->Ptr_Comp);
    if (Next_Record->Discr == Ident_1) {
        Next_Record->variant.var_1.Int_Comp = 6;
        Proc_6(Ptr_Val_Par->variant.var_1.Enum_Comp, &Next_Record->variant.var_1.Enum_Comp);
        Next_Record->Ptr_Comp = Ptr_Glob->Ptr_Comp;
        Proc_7(Next_Record->variant.var_1.Int_Comp, 10, &Next_Record->variant.var_1.Int_Comp);
    } else {
        structassign(*Ptr_Val_Par, *Ptr_Val_Par->Ptr_Comp);
    }
}

Proc_2(Int_Par_Ref)
One_Fifty *Int_Par_Ref;
{
    One_Fifty Int_Loc;
    Enumeration Enum_Loc;

    Int_Loc = *Int_Par_Ref + 10;
    do if (Ch_1_Glob == 'A') {
        Int_Loc -= 1;
        *Int_Par_Ref = Int_Loc - Int_Glob;
        Enum_Loc = Ident_1;
    } while (Enum_Loc != Ident_1);
}

Proc_3(Ptr_Ref_Par)
Rec_Pointer *Ptr_Ref_Par;
{
    if (Ptr_Glob != Null)
        *Ptr_Ref_Par = Ptr_Glob->Ptr_Comp;
    Proc_7(10, Int_Glob, &Ptr_Glob->variant.var_1.Int_Comp);
}

Proc_4()
{
    Boolean Bool_Loc;
    Bool_Loc = Ch_1_Glob == 'A';
    Bool_Glob = Bool_Loc | Bool_Glob;
    Ch_2_Glob = 'B';
}

Proc_5()
{
    Ch_1_Glob = 'A';
    Bool_Glob = false;
}

#ifdef NOSTRUCTASSIGN
memcpy(d, s, l)
register char *d;
register char *s;
register int l;
{
    while (l--)
        *d++ = *s++;
}
#endif

